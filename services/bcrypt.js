const { Worker, isMainThread, parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');
const os = require('os');

//worker execution
if (!isMainThread) {
    parentPort.on('message', async ({ type, password, hash, rounds }) => {
        try {
            let result;
            switch (type) {
                case 'compare':
                    result = await bcrypt.compare(password, hash);
                    break;
                case 'hash':
                    result = await bcrypt.hash(password, rounds || 10);
                    break;
            }
            parentPort.postMessage({ success: true, result });
        } catch (error) {
            parentPort.postMessage({ success: false, error: error.message });
        }
    });
}
//main thread code
else {
    const workers = [];

    let currentWorker = 0;

    // Initialize worker pool
    const numWorkers = Math.max(1, os.cpus().length - 1);

    for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(__filename);
        worker.setMaxListeners(0);
        workers.push(worker);
    }

    function executeWorkerTask(task) {
        // Round-robin worker selection
        const worker = workers[currentWorker];
        currentWorker = (currentWorker + 1) % workers.length;

        return new Promise((resolve, reject) => {
            const messageHandler = (response) => {
                worker.removeListener('message', messageHandler);
                worker.removeListener('error', errorHandler);

                if (response.success) {
                    resolve(response.result);
                } else {
                    reject(new Error(response.error));
                }
            };

            const errorHandler = (error) => {
                worker.removeListener('message', messageHandler);
                worker.removeListener('error', errorHandler);

                reject(error);
            };

            worker.on('message', messageHandler);
            worker.on('error', errorHandler);

            worker.postMessage(task);
        });
    }

    module.exports = {
        compare: (password, hash) => executeWorkerTask({
            type: 'compare',
            password,
            hash
        }),
        hash: (password, rounds) => executeWorkerTask({
            type: 'hash',
            password,
            rounds
        }),
        destroy: () => {
            for (const worker of workers) {
                worker.terminate();
            }
            workers.length = 0;
        }
    };
}