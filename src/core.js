const worker_threads = require('node:worker_threads');

const $t = function(task) {
  return new MessageTaskManager(() => new worker_threads.Worker(task.getCode(), {eval: true}));
}

const $et = function(argumentArray, method) {
  let newTaskCode = new Task(null, method).getCode();
  newTaskCode += `\nw.parentPort.postMessage({'return': ${method.name}(${argumentArray})});`;
  return new EasyTaskManager(() => new worker_threads.Worker(newTaskCode, {eval: true}));
}

const $tfile = function(filePath) {
  return new MessageTaskManager(() => new worker_threads.Worker(filePath)); //untested
}

const waitAll = (promiseArray) => {

}

const waitAny = (promiseArray) => {

}

const waitAllTasks = (taskManagerArray) => {

}

const waitAnyTasks = (taskManagerArray) => {

}

const waitOrThrowOnTimeout = (promiseObject) => {

}

const waitOrReturnOnTimeout = (promiseObject) => {
  
}

class TaskManager {
  static #aliases = {};
  #taskAlias = undefined;

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

  waitForFinish() {
    if(!this.getIsFinished()) {
      return new Promise((resolve, reject) => {
        this.doOnExit((code) => resolve(code));
        this.doOnError((err) => reject(err));
      });
    }
    return this.getExitCode();
  }

  waitForFinishOrThrowOnTimeout(timeMS) {
    return new Promise((resolve, reject) => {
      const waitProcessPromise = this.waitForFinish();
      let timeout = setTimeout(() => reject(new Error('thread did not finish before timeout')), timeMS);
      waitProcessPromise.then((data) => {
        clearTimeout(timeout);
        resolve(data);
      }).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  waitForFinishOrReturnOnTimeout(timeMS) {
    return new Promise((resolve, reject) => {
      const waitProcessPromise = this.waitForFinish();
      let timeout = setTimeout(() => resolve(undefined), timeMS);
      waitProcessPromise.then((data) => {
        clearTimeout(timeout);
        resolve(data);
      }).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
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

  getIsOnline() {
    return this.#isOnline;
  }
  
  getIsFinished() {
    return this.#isFinished;
  }

  getExitCode() {
    return this.#exitCode;
  }

  setAlias(alias) {
    if(alias in Object.values(TaskManager.#aliases)) return false;
    this.#taskAlias = alias;
    TaskManager.#aliases[this.getID] = alias;
  }

  getAlias() {
    return this.#taskAlias;
  }
}

class MessageTaskManager extends TaskManager {
  constructor(startWorkerFunc) {
    super(startWorkerFunc);
  }

  sendMessage(messageName, message) {
    const messageBuilder = {};
    messageBuilder[messageName] = message;
    this.getWorker().postMessage(messageBuilder);
  }

  waitForMessageRecieved(messageName) {
    return new Promise((resolve, reject) => {
      this.doOnMessageRecieved(messageName, (data) => resolve(data));
    });
  }

  waitForMessageRecievedOrThrowOnTimeout(messageName, timeMS) {
    return new Promise((resolve, reject) => {
      const waitProcessPromise = this.waitForMessageRecieved(messageName);
      let timeout = setTimeout(() => reject(new Error('message was not received before timeout')), timeMS);
      waitProcessPromise.then((data) => {
        clearTimeout(timeout);
        resolve(data);
      }).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  waitForMessageRecievedOrReturnOnTimeout(messageName, timeMS) {
    return new Promise((resolve, reject) => {
      const waitProcessPromise = this.waitForMessageRecieved(messageName);
      let timeout = setTimeout(() => resolve(undefined), timeMS);
      waitProcessPromise.then((data) => {
        clearTimeout(timeout);
        resolve(data);
      }).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}

class EasyTaskManager extends TaskManager{
  #retVal = undefined;
  constructor(startWorkerFunc) {
    super(startWorkerFunc)
    this.doOnReturn((retVal) => this.#retVal = retVal);
  }

  doOnReturn(callback) {
    super.doOnMessageRecieved('return', callback);
  }

  //override
  waitForFinish() {
    if(!this.getIsFinished()) {
      return new Promise((resolve, reject) => {
        this.doOnReturn((retVal) => resolve(retVal));
        this.doOnError((err) => reject(err));
        this.doOnExit((code) => reject(code)); //if exiting without a return, assume an error occurred
      });
    }
    return this.#retVal;
  }
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

module.exports = { $t, $et, $tfile, Task, waitAll, waitAllTasks, waitAny, waitAnyTasks, waitOrThrowOnTimeout, waitOrReturnOnTimeout };