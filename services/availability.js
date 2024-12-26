let cacheService = require('../services/cache');
let dbService = require('../services/db');
const { timeNow, isNumeric } = require('./shared');
const { getFilters, getPersonFilters, updateGridSets } = require('./filters');

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

            const person_filters = await getPersonFilters(person);
            const existingFilter = person_filters['availability'];
            const existingRecords = existingFilter?.items || {};

            const recordsToUpdate = [];
            const recordsToInsert = [];
            const recordsToKeep = new Set(); // Track records that should be kept
            const processedIds = new Set();

            for (const [dayOfWeek, dayData] of Object.entries(availabilityData)) {
                if (!dayData) continue;

                const dayRecords = Object.values(existingRecords).filter(
                    (record) => record.day_of_week === parseInt(dayOfWeek),
                );

                const isActive = !dayData.isDisabled;

                // Handle the day-level record
                let dayRecord = dayRecords.find((r) => r.is_day);

                if (dayRecord) {
                    let newDayData = {
                        id: dayRecord.id,
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

                        if(!timeSlot.start.split(':').length || !timeSlot.end.split(':').length) {
                            continue;
                        }

                        let startHour = parseInt(timeSlot.start.split(':')[0]);
                        let endHour = parseInt(timeSlot.end.split(':')[0]);

                        if(!isNumeric(startHour) || !isNumeric(endHour)) {
                            continue;
                        }

                        //prevent start time hour from being greater than 23
                        if(startHour > 23 || endHour > 47) {
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
                                });
                            } else {
                                recordsToKeep.add(existingRecord.id);
                            }
                            processedIds.add(existingRecord.id);
                        } else {
                            recordsToInsert.push({
                                ...newTimeData,
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
                await dbService.batchInsert('persons_availability', recordsToInsert, true);

                for (let i = 0; i < recordsToInsert.length; i++) {
                    let record = recordsToInsert[i];
                    let frontend_id = frontendIds[i];

                    if (frontend_id) {
                        newRecordIds.set(frontend_id, record.id);
                    }
                }
            }

            if (recordsToUpdate.length > 0) {
                await dbService.batchUpdate('persons_availability', recordsToUpdate);
            }

            if (recordsToDelete.length > 0) {
                await dbService.batchUpdate('persons_availability', recordsToDelete);
            }

            // Update filter cache
            const filters = await getFilters();
            const availabilityFilter = filters.byToken['availability'];

            if (availabilityFilter) {
                if (!person_filters['availability']) {
                    person_filters['availability'] = {
                        is_active: true,
                        created: now,
                        updated: now,
                        items: {},
                    };
                }

                // Start with existing records
                const updatedItems = { ...person_filters['availability'].items };

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

                person_filters['availability'].items = updatedItems;
                person_filters['availability'].updated = now;

                const person_filter_cache_key = cacheService.keys.person_filters(
                    person.person_token,
                );
                await cacheService.setCache(person_filter_cache_key, person_filters);
            }

            // Map of frontend IDs to actual database IDs
            const idMapping = Object.fromEntries(newRecordIds);

            await updateGridSets(person, person_filters, 'availability');

            resolve({
                success: true,
                data: person_filters,
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

// Ensure time is in HH:mm:ss format
function ensureTimeFormat(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

module.exports = {
    default_start: DEFAULT_START,
    default_end: DEFAULT_END,
    saveAvailabilityData,
};
