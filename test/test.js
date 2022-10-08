const { $t, $et, Task } = require('../src/core');

const myTaskCode = function getFib(num) {
  // console.log(`here ${num}`)
  if (num === 0) {
    return 0;
  }
  else if (num === 1) {
    return 1;
  }
  else {
    return getFib(num - 1) + getFib(num - 2);
  }
}

const myEasyTask = $et([42], myTaskCode);

myEasyTask.doOnReturn((retVal) => console.log(`my easy task returned: ${retVal} !!!`));

// console.log

const myTask = new Task(
  {
    'fibCalc': (data) => {console.log(`${data.num} start time: ${process.hrtime()}`); w.parentPort.postMessage({'response': {num: data.num, fib: getFib(data.num)}});}
  },
  myTaskCode
);
// const myTask = new Task({}, () => console.log('hello World'));

// console.log(myTask.getCode());

const myThreads = [$t(myTask), $t(myTask), $t(myTask)];
for(const thread of myThreads) {
  thread.doOnMessageRecieved('response', (data) => {console.log(`${data.num} end time: ${process.hrtime()}`); console.log(data.fib);});
  thread.doOnExit((code) => console.log(`task finished: ${code}`));
}

myThreads[0].sendMessage('fibCalc', {num: 40});
myThreads[1].sendMessage('fibCalc', {num: 39});
myThreads[2].sendMessage('fibCalc', {num: 38});

// const myThread = $t(myTask);
// myThread.doOnMessageRecieved('response', (data) => console.log(data.fib));
// myThread.sendMessage('fibCalc', {num: 14});
// myThread.doOnExit((code) => console.log(`task finished: ${code}`));

