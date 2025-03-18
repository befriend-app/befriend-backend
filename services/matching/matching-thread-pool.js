const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

 let DEFAULT_POOL_SIZE = Math.max(1, os.cpus().length - 1);


function createMatchingThreadPool(options = {}) {
    const size = options.size || DEFAULT_POOL_SIZE;
    const workerPath = options.workerPath || path.resolve(__dirname, 'matching-worker.js');

    let workers = [];
    let taskQueue = [];
    let availableWorkers = [];
    let isInitialized = false;

    async function initialize() {
        if (isInitialized) {
            return;
        }

        try {
            for (let i = 0; i < size; i++) {
                const worker = new Worker(workerPath, {
                    workerData: { }
                });

                workers.push(worker);
                availableWorkers.push(i);

                // Set up error handling
                worker.on('error', (error) => {
                    console.error(`Worker error:`, error);
                    handleWorkerFailure(i);
                });

                // Handle worker exit
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`Worker stopped with exit code ${code}`);
                        handleWorkerFailure(i);
                    }
                });
            }

            isInitialized = true;
            console.log(`Worker pool initialized with ${size} workers`);
        } catch (error) {
            console.error('Failed to initialize worker pool:', error);
            throw error;
        }
    }

    function handleWorkerFailure(index) {
        // Remove from available workers if it's there
        const availableIndex = availableWorkers.indexOf(index);
        if (availableIndex !== -1) {
            availableWorkers.splice(availableIndex, 1);
        }

        // Replace the failed worker
        replaceWorker(index);
    }

    async function replaceWorker(index) {
        try {
            // Terminate the worker if it's still active
            try {
                if (workers[index]) {
                    await workers[index].terminate();
                }
            } catch (error) {
                console.error('Error terminating worker:', error);
            }

            // Create a new worker
            const newWorker = new Worker(workerPath, {
                workerData: { }
            });

            // Set up error handling for the new worker
            newWorker.on('error', (error) => {
                console.error(`Worker error:`, error);
                handleWorkerFailure(index);
            });

            newWorker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`Worker stopped with exit code ${code}`);
                    handleWorkerFailure(index);
                }
            });

            // Replace worker in the array
            workers[index] = newWorker;

            // Add worker back to available pool
            if (!availableWorkers.includes(index)) {
                availableWorkers.push(index);
            }

            // Process any pending tasks
            processQueue();
        } catch (error) {
            console.error('Failed to replace worker:', error);
        }
    }

    function processTask(worker, task) {
        return new Promise((resolve, reject) => {
            const { data, resolve: taskResolve, reject: taskReject } = task;

            const messageHandler = (result) => {
                if (result.namespace !== 'matching') {
                    return;
                }

                worker.removeListener('message', messageHandler);
                worker.removeListener('error', errorHandler);

                // Add worker back to available pool
                const index = workers.indexOf(worker);

                if (index !== -1 && !availableWorkers.includes(index)) {
                    availableWorkers.push(index);
                }

                if (result.success) {
                    taskResolve(result.data);
                    resolve();
                } else {
                    const error = new Error(result.error || 'Unknown worker error');
                    taskReject(error);
                    resolve();
                }

                // Process next task if any
                processQueue();
            };

            const errorHandler = (error) => {
                worker.removeListener('message', messageHandler);
                worker.removeListener('error', errorHandler);

                taskReject(error);
                resolve();

                // Process next task if any
                processQueue();
            };

            worker.on('message', messageHandler);
            worker.on('error', errorHandler);

            worker.postMessage({
                namespace: 'matching',
                payload: data
            });
        });
    }

    function processQueue() {
        // If we have tasks and available workers, execute them
        while (taskQueue.length > 0 && availableWorkers.length > 0) {
            const workerIndex = availableWorkers.shift();
            const task = taskQueue.shift();
            const worker = workers[workerIndex];

            processTask(worker, task).catch(error => {
                console.error('Error processing task:', error);
            });
        }
    }

    return {
        // Check if pool is initialized
        isInitialized: () => isInitialized,

        // Initialize the thread pool
        initialize: async () => {
            await initialize();
        },

        // Run a matching task
        runMatching: async (me, params = {}, custom_filters = null, initial_person_tokens = []) => {
            return new Promise(async (resolve, reject) => {
                if (!isInitialized) {
                    await initialize();
                }

                //matching parameters
                const data = { me, params, custom_filters, initial_person_tokens };
                const task = { data, resolve, reject };

                taskQueue.push(task);
                processQueue();
            });
        },

        // Shut down the thread pool
        shutdown: async () => {
            const terminationPromises = workers.map(worker => worker.terminate());
            await Promise.all(terminationPromises);

            workers = [];
            availableWorkers = [];
            taskQueue = [];
            isInitialized = false;

            console.log('Worker pool has been shut down');
        }
    };
}

module.exports = createMatchingThreadPool;