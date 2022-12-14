const { $t, $et, Task, TaskManager, MessageTaskManager, EasyTaskManager } = require('../src/core');

const runThreadAndWait = async (thread) => {
  const returnCode = await thread.waitForFinishOrReturnOnTimeout(3_000);
  console.log(`My thread has finished with the code: ${returnCode}`);
}

const runThreadAndWaitForMessage = async (thread, message) => {
  thread.waitForMessageRecievedOrReturnOnTimeout(message, 10).then((response) => console.log(`My thread has returned the response: ${response}`));
}

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

const myEasyTask = $et([41], myTaskCode);

myEasyTask.doOnReturn((retVal) => console.log(`my easy task returned: ${retVal} !!!`));
runThreadAndWait(myEasyTask);


// console.log

const myTask = new Task(
  {
    'fibCalc': (data) => {console.log(`${data.num} start time: ${process.hrtime()}`); w.parentPort.postMessage({'response': {num: data.num, fib: getFib(data.num)}}); process.exit()}
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

runThreadAndWait(myThreads[0]);

myThreads[0].doOnExit((code) => {
  console.log(`test thread return code: ${code}`);
});

runThreadAndWaitForMessage(myThreads[1], 'response');

async function awaitForAllThreadsToFinish(threadArray) {
  const returnMap = await TaskManager.waitAllTasks(threadArray);
  console.log(`All of my tasks have finished with the return map: ${JSON.stringify(returnMap)}`);
}

async function awaitForAnyThreadsToFinish(threadArray) {
  const returnMap = await TaskManager.waitAnyTasks(threadArray);
  console.log(`one of my tasks have finished with the return map: ${JSON.stringify(returnMap)}`);
}

// async function awaitForAnyThreadsToFinishViaPromise() {
//   const returnMap = await waitAny([$et([40], myTaskCode).waitForFinish(), $et([40], myTaskCode).waitForFinish(), $et([35], myTaskCode).waitForFinish()]);
//   console.log(`Promise loopback: one of my tasks have finished with the return map: ${JSON.stringify(returnMap)}`);
// }

const taskManagerArray = [$et([40], myTaskCode), $et([40], myTaskCode), $et([35], myTaskCode)]
awaitForAllThreadsToFinish(taskManagerArray);
awaitForAnyThreadsToFinish(taskManagerArray);
// awaitForAnyThreadsToFinishViaPromise();

