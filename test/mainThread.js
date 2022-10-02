//app.js

const {Worker} = require("worker_threads");
const { $t, $tfile } = require('../src/core');

//Create new worker
const worker1 = new Worker("./worker.js");
const worker2 = new Worker("./worker.js");
const worker3 = new Worker("./worker.js");

const workers = [worker1, worker2, worker3];

//Listen for a message from worker
for(const worker of workers) {
  worker.on("message", result => {
    console.log(`${result.num}th Fibonacci Number: ${result.fib}`);
  });

  worker.on("error", error => {
    console.log(error);
  });
}

worker1.postMessage({num: 40});
console.log('starting next')
worker2.postMessage({num: 12});
worker3.postMessage({num: 6});