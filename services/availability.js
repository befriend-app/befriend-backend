let cacheService = require('../services/cache');
let dbService = require('../services/db');
const { timeNow, isNumeric, getTimeZoneFromCoords, generateToken } = require('./shared');
const {
    getFilters,
    getPersonFilters,
    updateGridSets,
    getPersonFilterForKey,
} = require('./filters');
const dayjs = require('dayjs');

const DEFAULT_START = '09:00:00';
const DEFAULT_END = '21:00:00';

function hasRecordChanged(existingRecord, newData) {
    return (
        existingRecord.is_active !== newData.is_active ||
        existingRecord.is_any_time !== newData.is_any_time ||
        existingRecord.start_time !== newData.start_time ||
        existingRecord.end_time !== newData.end_time ||
        existingRecord.is_overnight !== newData.is_overnight ||
        existingRecord.is_day !== newData.is_day ||
        existingRecord.is_time !== newData.is_time
    );
}

function saveAvailabilityData(person, availabilityData) {
    return new Promise(async (resolve, reject) => {
        try {
            const now = timeNow();

            if (!availabilityData || typeof availabilityData !== 'object') {
                return reject('Invalid availability data format');
            }

            let existingFilter = await getPersonFilterForKey(person, 'availability');
            const existingRecords = existingFilter?.items || {};

            const recordsToUpdate = [];
            const recordsToInsert = [];
            const recordsToKeep = new Set(); // Track records that should be kept
            const processedIds = new Set();

            for (const [dayOfWeek, dayData] of Object.entries(availabilityData)) {
                if (!dayData) {
                    continue;
                }

                const dayRecords = Object.values(existingRecords).filter(
                    (record) => record.day_of_week === parseInt(dayOfWeek),
                );

                const isActive = !dayData.isDisabled;

                // Handle the day-level record
                let dayRecord = dayRecords.find((r) => r.is_day);

                if (dayRecord) {
                    let newDayData = {
                        id: dayRecord.id,
                        token: dayRecord.token,
                        person_id: person.id,
                        day_of_week: parseInt(dayOfWeek),
                        is_day: true,
                        is_time: false,
                        start_time: DEFAULT_START,
                        end_time: DEFAULT_END,
                        is_overnight: false,
                        is_active: isActive,
                        updated: now,
                    };

                    // Case 1: Explicitly set Any Time
                    if (dayData.isAny) {
                        newDayData.is_any_time = true;
                    }
                    // Case 2: Custom times being added
                    else if (dayData.times && Object.keys(dayData.times).length > 0) {
                        newDayData.is_any_time = false;
                    }
                    // Case 3: No times defined, preserve previous Any Time state
                    else if (!dayData.times || Object.keys(dayData.times).length === 0) {
                        newDayData.is_any_time = dayRecord.is_any_time;
                    }

                    // Only update if there are changes
                    if (hasRecordChanged(dayRecord, newDayData)) {
                        recordsToUpdate.push(newDayData);
                    } else {
                        recordsToKeep.add(dayRecord.id);
                    }
                    processedIds.add(dayRecord.id);
                } else {
                    recordsToInsert.push({
                        person_id: person.id,
                        token: generateToken(14),
                        day_of_week: parseInt(dayOfWeek),
                        is_day: true,
                        is_time: false,
                        start_time: DEFAULT_START,
                        end_time: DEFAULT_END,
                        is_overnight: false,
                        is_any_time: dayData.isAny || false,
                        is_active: isActive,
                        created: now,
                        updated: now,
                    });
                }

                // Handle time slots
                if (
                    !dayData.isAny &&
                    dayData.times &&
                    typeof dayData.times === 'object' &&
                    Object.keys(dayData.times).length
                ) {
                    for (const [timeId, timeSlot] of Object.entries(dayData.times)) {
                        if (!timeSlot.start || !timeSlot.end) continue;

                        let existingRecord = timeSlot.id
                            ? existingRecords[timeSlot.id]
                            : dayRecords.find((r) => !processedIds.has(r.id) && r.is_time);

                        if (!timeSlot.start.split(':').length || !timeSlot.end.split(':').length) {
                            continue;
                        }

                        let startHour = parseInt(timeSlot.start.split(':')[0]);
                        let endHour = parseInt(timeSlot.end.split(':')[0]);

                        if (!isNumeric(startHour) || !isNumeric(endHour)) {
                            continue;
                        }

                        //prevent start time hour from being greater than 23
                        if (startHour > 23 || endHour > 47) {
                            continue;
                        }

                        const startTime = ensureTimeFormat(timeSlot.start);

                        const endTime = ensureTimeFormat(timeSlot.end);
                        const isOvernight = endHour >= 24;

                        const newTimeData = {
                            person_id: person.id,
                            day_of_week: parseInt(dayOfWeek),
                            is_day: false,
                            is_time: true,
                            start_time: startTime,
                            end_time: endTime,
                            is_overnight: isOvernight,
                            is_any_time: false,
                            is_active: isActive,
                            updated: now,
                        };

                        if (existingRecord) {
                            // Only update if there are actual changes
                            if (hasRecordChanged(existingRecord, newTimeData)) {
                                recordsToUpdate.push({
                                    ...newTimeData,
                                    id: existingRecord.id,
                                    token: existingRecord.token,
                                });
                            } else {
                                recordsToKeep.add(existingRecord.id);
                            }
                            processedIds.add(existingRecord.id);
                        } else {
                            recordsToInsert.push({
                                ...newTimeData,
                                token: generateToken(14),
                                frontend_id: timeId,
                                created: now,
                            });
                        }
                    }
                }
            }

            // Only delete records that aren't being kept and weren't processed
            const recordsToDelete = Object.values(existingRecords)
                .filter(
                    (record) =>
                        !record.is_day && // Only include time records
                        !processedIds.has(record.id) &&
                        !recordsToKeep.has(record.id) &&
                        !record.deleted, // Don't delete already deleted records
                )
                .map((record) => ({
                    id: record.id,
                    deleted: now,
                    updated: now,
                }));

            const frontendIds = [];
            const newRecordIds = new Map(); // Map frontend_ids to database ids

            if (recordsToInsert.length > 0) {
                //store frontend id, remove from insert
                for (let record of recordsToInsert) {
                    frontendIds.push(record.frontend_id || null);
                    delete record.frontend_id;
                }

                try {
                    await dbService.batchInsert('persons_availability', recordsToInsert, true);
                } catch (e) {
                    console.error(e);
                    return reject(e);
                }

                for (let i = 0; i < recordsToInsert.length; i++) {
                    let record = recordsToInsert[i];
                    let frontend_id = frontendIds[i];

                    if (frontend_id) {
                        newRecordIds.set(frontend_id, record.id);
                    }
                }
            }

            if (recordsToUpdate.length > 0) {
                try {
                    await dbService.batchUpdate('persons_availability', recordsToUpdate);
                } catch (e) {
                    console.error(e);
                    return reject(e);
                }
            }

            if (recordsToDelete.length > 0) {
                try {
                    await dbService.batchUpdate('persons_availability', recordsToDelete);
                } catch (e) {
                    console.error(e);
                    return reject(e);
                }
            }

            // Update filter cache
            const filters = await getFilters();
            const availabilityFilter = filters.byToken['availability'];

            if (availabilityFilter) {
                if (!existingFilter) {
                    existingFilter = {
                        is_active: true,
                        created: now,
                        updated: now,
                        items: {},
                    };
                }

                // Start with existing records
                const updatedItems = { ...existingFilter.items };

                // Remove deleted records
                for (let record of recordsToDelete) {
                    delete updatedItems[record.id];
                }

                // Update modified records
                for (let record of recordsToUpdate) {
                    updatedItems[record.id] = {
                        ...record,
                        created: existingRecords[record.id]?.created || now,
                    };
                }

                // Add new records
                for (let record of recordsToInsert) {
                    updatedItems[record.id] = {
                        ...record,
                    };
                }

                existingFilter.items = updatedItems;
                existingFilter.updated = now;

                const person_filter_cache_key = cacheService.keys.person_filters(
                    person.person_token,
                );

                await cacheService.hSet(person_filter_cache_key, 'availability', existingFilter);
            }

            // Map of frontend IDs to actual database IDs
            const idMapping = Object.fromEntries(newRecordIds);

            await updateGridSets(
                person,
                {
                    availability: existingFilter,
                },
                'availability',
            );

            resolve({
                success: true,
                data: existingFilter,
                message: 'Availability updated successfully',
                changed:
                    recordsToUpdate.length > 0 ||
                    recordsToInsert.length > 0 ||
                    recordsToDelete.length > 0,
                idMapping, // Return the ID mappings to the frontend
            });
        } catch (e) {
            console.error('Error in saveAvailabilityData:', e);
            reject(e);
        }
    });
}

function isPersonAvailable(person, filter, activity = null) {
    function isWithinDefault(startTime, endTime) {
        const currentDate = startTime.format('YYYY-MM-DD');
        const start = dayjs.tz(`${currentDate} ${DEFAULT_START}`, person.timezone);
        const end = dayjs.tz(`${currentDate} ${DEFAULT_END}`, person.timezone);

        return (
            (startTime.isAfter(start) || startTime.isSame(start)) &&
            (endTime.isBefore(end) || endTime.isSame(end))
        );
    }

    const currentUTC = dayjs().utc();

    let timezone = person.timezone;

    if(!timezone) {
        return false;
    }

    if (activity?.place?.data) {
        if (activity.place.data.timezone) {
            timezone = activity.place.data.timezone;
        } else {
            timezone = getTimeZoneFromCoords(
                activity.place.data.location_lat,
                activity.place.data.location_lon,
            );
        }
    }

    // Convert current UTC time to person's timezone
    const personTime = currentUTC.tz(person.timezone);
    let activityStartTime = personTime;
    let activityEndTime = personTime;

    //set activity start time if provided
    if (activity?.when?.in_mins) {
        activityStartTime = currentUTC.tz(timezone).add(activity.when.in_mins, 'minutes');
        activityEndTime = activityStartTime.add(activity.duration, 'minutes');
    } else {
        activityEndTime = activityStartTime.add(60, 'minutes');
    }

    const currentDayOfWeek = personTime.day();
    const prevDayIndex = (currentDayOfWeek - 1 + 7) % 7;

    // Handle default availability if filter is disabled or not present
    if (!filter || !filter.is_active) {
        return isWithinDefault(activityStartTime, activityEndTime);
    }

    const availabilityItems = filter.items;

    let daySlot = null;
    let prevDaySlot = null;

    for (let id in availabilityItems) {
        const slot = availabilityItems[id];

        if (slot.is_day && slot.day_of_week === currentDayOfWeek && !slot.deleted) {
            daySlot = slot;
        }

        if (slot.is_day && slot.day_of_week === prevDayIndex && !slot.deleted) {
            prevDaySlot = slot;
        }
    }

    let isAvailableNow = false;

    // Check previous day's overnight slots first
    if (prevDaySlot && prevDaySlot.is_active) {
        for (let id in availabilityItems) {
            const slot = availabilityItems[id];

            if (
                slot.day_of_week === prevDayIndex &&
                slot.is_time &&
                slot.is_overnight &&
                slot.is_active &&
                !slot.deleted
            ) {
                // Handle end times > 24:00:00
                const [endHour] = slot.end_time.split(':').map(Number);

                if (endHour >= 24) {
                    const adjustedEndTime = slot.end_time.replace(
                        /^\d+/,
                        String(endHour - 24).padStart(2, '0'),
                    );

                    let endTime = dayjs.tz(
                        `${activityStartTime.format('YYYY-MM-DD')} ${adjustedEndTime}`,
                        timezone,
                    );

                    if (activity?.duration) {
                        endTime.add(activity.duration, 'minutes');
                    }

                    if (personTime.isBefore(endTime)) {
                        isAvailableNow = true;
                        break;
                    }
                }
            }
        }
    }

    if (isAvailableNow) {
        return true;
    }

    // If not available from overnight slot, check current day
    // Skip if day is disabled
    if (typeof daySlot?.is_active !== 'undefined' && !daySlot.is_active) {
        return false;
    }

    // Available all day if any_time is set
    if (daySlot?.is_any_time) {
        return true;
    }

    // Check current day's time slots
    let hasTimeSlots = false;

    for (let id in availabilityItems) {
        const slot = availabilityItems[id];

        if (
            slot.day_of_week === currentDayOfWeek &&
            slot.is_time &&
            slot.is_active &&
            !slot.deleted
        ) {
            hasTimeSlots = true;

            const currentDate = activityStartTime.format('YYYY-MM-DD');
            const startTime = dayjs.tz(`${currentDate} ${slot.start_time}`, person.timezone);

            // Parse end time hours
            const [endHour] = slot.end_time.split(':').map(Number);

            if (endHour < 24) {
                // Regular time slot ending same day
                const endTime = dayjs.tz(`${currentDate} ${slot.end_time}`, person.timezone);

                if (
                    activityStartTime.isSame(startTime) ||
                    (activityStartTime.isAfter(startTime) && activityEndTime.isBefore(endTime))
                ) {
                    isAvailableNow = true;
                    break;
                }
            } else {
                // Overnight slot ending next day
                const nextDate = personTime.add(1, 'day').format('YYYY-MM-DD');
                const adjustedEndTime = slot.end_time.replace(
                    /^\d+/,
                    String(endHour - 24).padStart(2, '0'),
                );
                const endTime = dayjs.tz(`${nextDate} ${adjustedEndTime}`, person.timezone);

                if (activityStartTime.isSame(startTime) || activityStartTime.isAfter(startTime)) {
                    // For overnight slots, we're available after start
                    // until midnight and into next day until end time
                    isAvailableNow = true;
                    break;
                }
            }
        }
    }

    if (!hasTimeSlots) {
        return isWithinDefault(activityStartTime, activityEndTime);
    }

    return isAvailableNow;
}

// Ensure time is in HH:mm:ss format
function ensureTimeFormat(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

module.exports = {
    default_start: DEFAULT_START,
    default_end: DEFAULT_END,
    saveAvailabilityData,
    isPersonAvailable,
};
