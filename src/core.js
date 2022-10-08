const worker_threads = require('node:worker_threads');

const $t = function(task) {
  return createNewTaskManager(task.getCode());
}

const $et = function(argumentArray, method) {
  let newTaskCode = new Task(null, method).getCode();
  newTaskCode += `\nw.parentPort.postMessage({'return': ${method.name}(${argumentArray})});`;
  return new EasyTaskManager(createNewTaskManager(newTaskCode));
}

const $tfile = function(filePath) {
  return new TaskManager(() => new worker_threads.Worker(filePath));
}

class EasyTaskManager {
  #taskManager;
  #retVal = undefined;
  constructor(taskManager) {
    this.#taskManager = taskManager;
    this.doOnReturn((retVal) => this.#retVal = retVal);
  }

  doOnReturn(callback) {
    this.#taskManager.doOnMessageRecieved('return', callback);
  }

  doOnError(callback) {
    this.#taskManager.doOnError(callback);
  }

  doOnExit(callback) {
    this.#taskManager.doOnExit(callback);
  }

  async waitForFinish() {
    if(!this.getIsFinished()) {
      return new Promise((resolve, reject) => {
        this.doOnReturn((retVal) => resolve(retVal));
        this.doOnError((err) => reject(err));
        this.doOnExit((code) => reject(code)); //if exiting without a return, assume an error occurred
      });
    }
    return this.#retVal;
  }

  getIsOnline() {
    return this.#taskManager.getIsOnline();
  }

  getIsFinished() {
    return this.#taskManager.getIsFinished();
  }

  getExitCode() {
    return this.#taskManager.getExitCode();
  }
}

class TaskManager {
  #worker = undefined;
  #isOnline = false;
  #isFinished = false;
  #exitCode = null;

  #onExitEvents = [];
  #onErrorEvents = [];
  #onMessageRecievedEvents = {};

  constructor(startWorkerFunc) {
    this.#worker = startWorkerFunc();
    this.#worker.on("online", () => {
      this.#isOnline = true;
    });

    this.#worker.on('exit', code => {
      this.#exitCode = code;
      this.#isFinished = true;
      this.#isOnline = false;
      this.#onExitEvents.forEach((callback) => callback(code));
    });

    this.#worker.on('error', err => {
      this.#onErrorEvents.forEach((callback) => callback(err))
    });

    this.#worker.on('message', data => {
      const key = Object.keys(data)[0];
      this.#onMessageRecievedEvents[key].forEach((callback) => callback(data[key]));
    });
  }

  sendMessage(messageName, message) {
    const messageBuilder = {};
    messageBuilder[messageName] = message;
    this.#worker.postMessage(messageBuilder);
  }

  doOnMessageRecieved(messageName, callback) {
    if(this.#onMessageRecievedEvents[messageName] !== undefined) {
      this.#onMessageRecievedEvents[messageName].push(callback);
    } else {
      this.#onMessageRecievedEvents[messageName] = [callback];
    }
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

  waitForFinish() {
    if(!this.#isFinished) {
      return new Promise((resolve, reject) => {
        this.doOnExit((code) => resolve(code));
        this.doOnError((err) => reject(err));
      });
    }
    return this.#exitCode;
  }

  getIsOnline() {
    return this.#isOnline;
  }
  
  getIsFinished() {
    return this.#isFinished;
  }

  getExitCode() {
    return this.#exitCode;
  }
}

const createNewTaskManager = (taskCode) => {
  return new TaskManager(() => new worker_threads.Worker(taskCode, {eval: true}))
}

class Task {
  #code;

  constructor(messages, script) {
    this.#code = this.#compile(messages, script);
  }

  #compile(messages, script){
    const outputScriptBuilder = ["const w = require('node:worker_threads');"];
    if(messages !== undefined && messages !== null && messages.length !== 0) {
      outputScriptBuilder.push('messagesMap = {');
      const messagesMapBuilder = [];
      Object.keys(messages).forEach((message) => {
        messagesMapBuilder.push(`'${message}': ${messages[message]}`);
      });
      outputScriptBuilder.push(messagesMapBuilder.join(',\n'));
      outputScriptBuilder.push('};');
      outputScriptBuilder.push('w.parentPort.on("message", data => {const key = Object.keys(data)[0]; messagesMap[key](data[key]);});');
    }
    outputScriptBuilder.push(`${script}`);
    return outputScriptBuilder.join('\n');
  }

  getCode() {
    return this.#code;
  }
}

module.exports = { $t, $et, $tfile, Task };