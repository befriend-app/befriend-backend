let cacheService = require('../services/cache');
let dbService = require('../services/db');
const { timeNow } = require('./shared');
const { getFilters, getPersonFilters } = require('./filters');

const DEFAULT_START = '09:00:00';
const DEFAULT_END = '21:00:00';

function hasRecordChanged(existingRecord, newData) {
    return existingRecord.is_active !== newData.is_active ||
        existingRecord.is_any_time !== newData.is_any_time ||
        existingRecord.start_time !== newData.start_time ||
        existingRecord.end_time !== newData.end_time ||
        existingRecord.is_overnight !== newData.is_overnight ||
        existingRecord.is_day !== newData.is_day ||
        existingRecord.is_time !== newData.is_time;
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
                    record => record.day_of_week === parseInt(dayOfWeek)
                );

                const isActive = !dayData.isDisabled;

                // Handle the day-level record
                let dayRecord = dayRecords.find(r => r.is_day);

                if (dayRecord) {
                    const newDayData = {
                        id: dayRecord.id,
                        person_id: person.id,
                        day_of_week: parseInt(dayOfWeek),
                        is_day: true,
                        is_time: false,
                        start_time: DEFAULT_START,
                        end_time: DEFAULT_END,
                        is_overnight: false,
                        is_any_time: dayData.isAny || dayRecord.is_any_time || dayRecord,
                        is_active: isActive,
                        updated: now
                    };

                    // Only update if there are actual changes
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
                        is_any_time: dayData.isAny,
                        is_active: isActive,
                        created: now,
                        updated: now
                    });
                }

                // Handle time slots
                if (dayData.times && typeof dayData.times === 'object' && Object.keys(dayData.times).length) {
                    for (const [timeId, timeSlot] of Object.entries(dayData.times)) {
                        if (!timeSlot.start || !timeSlot.end) continue;

                        let existingRecord = timeSlot.id ?
                            existingRecords[timeSlot.id] :
                            dayRecords.find(r => !processedIds.has(r.id) && r.is_time);

                        const startTime = ensureTimeFormat(timeSlot.start);
                        const endTime = ensureTimeFormat(timeSlot.end);
                        const isOvernight = isTimeSlotOvernight(startTime, endTime);

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
                            updated: now
                        };

                        if (existingRecord) {
                            // Only update if there are actual changes
                            if (hasRecordChanged(existingRecord, newTimeData)) {
                                recordsToUpdate.push({
                                    ...newTimeData,
                                    id: existingRecord.id
                                });
                            } else {
                                recordsToKeep.add(existingRecord.id);
                            }
                            processedIds.add(existingRecord.id);
                        } else {
                            recordsToInsert.push({
                                ...newTimeData,
                                frontend_id: timeId,
                                created: now
                            });
                        }
                    }
                }
            }

            // Only delete records that aren't being kept and weren't processed
            const recordsToDelete = Object.values(existingRecords)
                .filter(record =>
                    !processedIds.has(record.id) &&
                    !recordsToKeep.has(record.id) &&
                    !record.deleted // Don't delete already deleted records
                )
                .map(record => ({
                    id: record.id,
                    deleted: now,
                    updated: now
                }));

            const newRecordIds = new Map(); // Map frontend_ids to database ids

            if (recordsToInsert.length > 0) {
                await dbService.batchInsert('persons_availability', recordsToInsert, true);

                for(let record of recordsToInsert) {
                    if (record.frontend_id) {
                        newRecordIds.set(record.frontend_id, record.id);
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
                        items: {}
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
                        created: existingRecords[record.id]?.created || now
                    };
                }

                // Add new records
                for (let record of recordsToInsert) {
                    updatedItems[record.id] = {
                        ...record,
                        frontend_id: record.frontend_id || null
                    };
                }

                person_filters['availability'].items = updatedItems;
                person_filters['availability'].updated = now;

                const person_filter_cache_key = cacheService.keys.person_filters(person.person_token);
                await cacheService.setCache(person_filter_cache_key, person_filters);
            }

            // Map of frontend IDs to actual database IDs
            const idMapping = Object.fromEntries(newRecordIds);

            resolve({
                success: true,
                data: person_filters,
                message: 'Availability updated successfully',
                changed: recordsToUpdate.length > 0 || recordsToInsert.length > 0 || recordsToDelete.length > 0,
                idMapping // Return the ID mappings to the frontend
            });
        } catch (e) {
            console.error('Error in saveAvailabilityData:', e);
            reject(e);
        }
    });
}

// Helper function to ensure time is in HH:mm:ss format
function ensureTimeFormat(timeString) {
    // If time is in HH:mm format, add seconds
    if (/^\d{2}:\d{2}$/.test(timeString)) {
        return `${timeString}:00`;
    }
    return timeString;
}

// Helper function to determine if a time slot crosses midnight
function isTimeSlotOvernight(startTime, endTime) {
    const start = new Date(`2000/01/01 ${startTime}`);
    const end = new Date(`2000/01/01 ${endTime}`);
    return end < start;
}

// Helper function to detect changes between current and new records
function detectChanges(currentRecords, newRecords) {
    if (currentRecords.length !== newRecords.length) {
        return true;
    }

    // Sort both arrays for comparison
    const sortedCurrent = [...currentRecords].sort((a, b) =>
        a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
    );
    const sortedNew = [...newRecords].sort((a, b) =>
        a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
    );

    // Compare each record
    return sortedCurrent.some((current, index) => {
        const next = sortedNew[index];
        return current.day_of_week !== next.day_of_week ||
            current.start_time !== next.start_time ||
            current.end_time !== next.end_time ||
            current.is_any_time !== next.is_any_time ||
            current.is_overnight !== next.is_overnight;
    });
}

module.exports = {
    saveAvailabilityData
};