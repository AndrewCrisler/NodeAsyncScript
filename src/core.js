const worker_threads = require('node:worker_threads');

const $t = function(task) {
  return new TaskManager(() => new worker_threads.Worker(task.getCode(), {eval: true}));
}

const $tfile = function(filePath) {
  return new TaskManager(() => new worker_threads.Worker(filePath));
}

class TaskManager {
  #worker = undefined;
  isOnline = false;
  isFinished = false;
  exitCode = null;

  #onExitEvents = [];
  #onErrorEvents = [];
  #onMessageRecievedEvents = {};

  constructor(startWorkerFunc) {
    this.#worker = startWorkerFunc();
    this.#worker.on("online", () => {
      this.isOnline = true;
    });
    this.#worker.on('exit', code => {
      this.exitCode = code;
      this.isFinished = true;
      this.#onExitEvents.forEach((callback) => callback(code));
    });
    this.#worker.on('error', err => {
      this.#onErrorEvents.forEach((callback) => callback(err))
    });
    this.#worker.on('message', data => {
      // console.log(`message recieved! ${data}`);
      // console.log(data);
      const key = Object.keys(data)[0];
      this.#onMessageRecievedEvents[key](data[key]);
    })
  }

  sendMessage(messageName, message) {
    const messageBuilder = {};
    messageBuilder[messageName] = message;
    // console.log(messageBuilder)
    this.#worker.postMessage(messageBuilder);
  }

  doOnMessageRecieved(messageName, callback) {
    this.#onMessageRecievedEvents[messageName] = callback;
  }

  doOnExit(callback) {
    this.#onExitEvents.push(callback);
  }

  doOnError(callback) {
    this.#onErrorEvents.push(callback);
  }

  getID() {
    return this.#worker.threadId;
  }

  kill() {
    return this.#worker.terminate();
  }

  getWorker() { //added incase user wants to use advanced worker features
    return this.#worker;
  }
}

class Task {
  #code;

  constructor(messages, script) {
    this.#code = this.#compile(messages, script);
  }

  #compile(messages, script){
    const outputScriptBuilder = ["const w = require('node:worker_threads');"];
    outputScriptBuilder.push('messagesMap = {');
    const messagesMapBuilder = [];
    Object.keys(messages).forEach((message) => {
      messagesMapBuilder.push(`'${message}': ${messages[message]}`);
    });
    outputScriptBuilder.push(messagesMapBuilder.join(',\n'));
    outputScriptBuilder.push('};');
    outputScriptBuilder.push('w.parentPort.on("message", data => {const key = Object.keys(data)[0]; messagesMap[key](data[key]);});');
    outputScriptBuilder.push(`${script}`);
    return outputScriptBuilder.join('\n');
  }

  getCode() {
    return this.#code;
  }

  // static clone(task) {
  //   return Object.assign("", task.#code);
  // }
}

module.exports = { $t, $tfile, Task };