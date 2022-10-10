const {waitAll} = require('../src/core');

function getFib(num) {
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

async function awaitAllCalcs(promiseArray) {
  await waitAll(promiseArray);
  console.log('all calcs have finished!!!');
}

// async function awaitAnyCalcs(promiseArray) {
//   promiseArray[0].then((retVal) => console.log('first promise finished'))
//   await waitAny(promiseArray);
//   console.log('one calcs have finished!!!');
// }

async function calcFib(num) {
  // console.log(`${num} start time: ${process.hrtime()}`);
  // const fib = await new Promise((resolve, reject) => {
  //   resolve(getFib(num));
  // });
  // console.log(`${num} end time: ${process.hrtime()}`);
  // console.log(fib);
  // return fib;

  return new Promise((resolve, reject) => {
    resolve(getFib(num));
  });
}

async function runTests() {
  // calcFib(40);
  // calcFib(39);
  // calcFib(38);
  const promiseArray = [calcFib(32), calcFib(39), calcFib(42)];


  // awaitAllCalcs(promiseArray);
}

runTests();


