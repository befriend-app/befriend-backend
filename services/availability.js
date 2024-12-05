let cacheService = require('../services/cache');
let dbService = require('../services/db');
const { timeNow } = require('./shared');
const { getFilters, getPersonFilters } = require('./filters');

const DEFAULT_START = '09:00:00';
const DEFAULT_END = '21:00:00';

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
            const processedIds = new Set();

            for (const [dayOfWeek, dayData] of Object.entries(availabilityData)) {
                if (!dayData) continue;

                const dayRecords = Object.values(existingRecords).filter(
                    record => record.day_of_week === parseInt(dayOfWeek)
                );

                const shouldBeActive = !dayData.isDisabled;
                for (const existingRecord of dayRecords) {
                    if (existingRecord) {
                        existingRecord.is_active = shouldBeActive;
                    }
                }

                if (dayData.times && typeof dayData.times === 'object' && Object.keys(dayData.times).length) {
                    for (const [timeId, timeSlot] of Object.entries(dayData.times)) {
                        if (!timeSlot.start || !timeSlot.end) continue;

                        let existingRecord = timeSlot.id ?
                            existingRecords[timeSlot.id] :
                            dayRecords.find(r => !processedIds.has(r.id));

                        if (existingRecord) {
                            recordsToUpdate.push({
                                id: existingRecord.id,
                                person_id: person.id,
                                day_of_week: parseInt(dayOfWeek),
                                start_time: existingRecord.start_time,
                                end_time: existingRecord.end_time,
                                is_overnight: existingRecord.is_overnight,
                                is_any_time: existingRecord.is_any_time,
                                is_active: shouldBeActive,
                                updated: now
                            });
                            processedIds.add(existingRecord.id);
                        } else {
                            const startTime = ensureTimeFormat(timeSlot.start);
                            const endTime = ensureTimeFormat(timeSlot.end);
                            const isOvernight = isTimeSlotOvernight(startTime, endTime);

                            recordsToInsert.push({
                                person_id: person.id,
                                day_of_week: parseInt(dayOfWeek),
                                start_time: startTime,
                                end_time: endTime,
                                is_overnight: isOvernight,
                                is_any_time: false,
                                is_active: shouldBeActive,
                                created: now,
                                updated: now
                            });
                        }
                    }
                } else {
                    const existingRecord = dayRecords.find(r => !processedIds.has(r.id));

                    if (existingRecord) {
                        recordsToUpdate.push({
                            id: existingRecord.id,
                            person_id: person.id,
                            day_of_week: parseInt(dayOfWeek),
                            start_time: existingRecord.start_time,
                            end_time: existingRecord.end_time,
                            is_overnight: existingRecord.is_overnight,
                            is_any_time: dayData.isAny || existingRecord.is_any_time,
                            is_active: shouldBeActive,
                            updated: now
                        });
                        processedIds.add(existingRecord.id);
                    } else {
                        // Use default times if no lastTimes available
                        recordsToInsert.push({
                            person_id: person.id,
                            day_of_week: parseInt(dayOfWeek),
                            start_time: dayData.lastTimes?.start || DEFAULT_START,
                            end_time: dayData.lastTimes?.end || DEFAULT_END,
                            is_overnight: false,
                            is_any_time: dayData.isAny,
                            is_active: shouldBeActive,
                            created: now,
                            updated: now
                        });
                    }
                }
            }

            // Handle records that need to be deleted
            const recordsToDelete = Object.values(existingRecords)
                .filter(record => !processedIds.has(record.id))
                .map(record => ({
                    id: record.id,
                    deleted: now,
                    updated: now
                }));

            // Execute batch operations and get new IDs
            if (recordsToInsert.length > 0) {
                await dbService.batchInsert('persons_availability', recordsToInsert, true);
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
                        filter_id: availabilityFilter.id,
                        is_send: true,
                        is_receive: true,
                        is_active: true,
                        created: now,
                        updated: now,
                        items: {}
                    };
                }

                const allRecords = [
                    ...recordsToInsert,
                    ...recordsToUpdate.map(record => ({
                        ...record,
                        created: existingRecords[record.id]?.created || now
                    }))
                ];

                person_filters['availability'].items = allRecords.reduce((acc, record) => {
                    acc[record.id] = record;
                    return acc;
                }, {});

                person_filters['availability'].updated = now;

                const person_filter_cache_key = cacheService.keys.person_filters(person.person_token);
                await cacheService.setCache(person_filter_cache_key, person_filters);
            }

            resolve({
                success: true,
                message: 'Availability updated successfully',
                changed: recordsToUpdate.length > 0 || recordsToInsert.length > 0 || recordsToDelete.length > 0
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