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

async function calcFib(num) {
  console.log(`${num} start time: ${process.hrtime()}`);
  const fib = await new Promise((resolve, reject) => {
    resolve(getFib(num));
  });
  console.log(`${num} end time: ${process.hrtime()}`);
  console.log(fib);
}

calcFib(40);
calcFib(39);
calcFib(38);

