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

const waitAll = async (promiseArray) => {
  return new Promise((resolve, reject) => {
    let promiseStatus = new Array(promiseArray.length).fill(false);
    let retValArray = new Array(promiseArray.length);

    const promiseComplete = (index, retVal) => {
      promiseStatus[index] = true;
      retValArray[index] = retVal;
      if(!(false in promiseStatus)) resolve(retValArray);
    }
    
    promiseArray.forEach((promiseObject, index) => {
      promiseObject.then(() => promiseComplete(index)).catch((err) => reject(err));
    });
  });
}

const waitOrThrowOnTimeout = async (promiseObject, timeMS, timeoutErrorMessage = 'promise did not finish before timeout') => {
  return new Promise((resolve, reject) => {
    let timeout = setTimeout(() => reject(new Error(timeoutErrorMessage)), timeMS);
    promiseObject.then((data) => {
      clearTimeout(timeout);
      resolve(data);
    }).catch((err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

const waitOrReturnOnTimeout = async (promiseObject, timeMS) => {
  return new Promise((resolve, reject) => {
    let timeout = setTimeout(() => resolve(undefined), timeMS);
    promiseObject.then((data) => {
      clearTimeout(timeout);
      resolve(data);
    }).catch((err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

class TaskManager {
  static #aliases = {};
  #taskAlias;

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
    this.#taskAlias = this.getID(); //default to id
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

  async waitForFinish() {
    if(!this.getIsFinished()) {
      return new Promise((resolve, reject) => {
        this.doOnExit((code) => resolve(code));
        this.doOnError((err) => reject(err));
      });
    }
    return this.getExitCode();
  }

  async waitForFinishOrThrowOnTimeout(timeMS) { //what if not a promise?
    return waitOrThrowOnTimeout(this.waitForFinish(), timeMS, 'thread did not finish before timeout');
  }

  async waitForFinishOrReturnOnTimeout(timeMS) {
    return waitOrReturnOnTimeout(this.waitForFinish(), timeMS);
  }

  static async waitAllTasks(taskManagerArray) {
    return new Promise((resolve, reject) => {
      let promiseStatus = [];
      let retValMap = {};
  
      const taskComplete = (retVal, alias) => {
        promiseStatus.push(alias);
        retValMap[alias] = retVal;
        if(promiseStatus.length === taskManagerArray.length){
          resolve(retValMap);
        }
      }
      
      taskManagerArray.forEach((taskManager) => {
        const taskManagerAlias = taskManager.getAlias();
        taskManager.waitForFinish().then((retVal) => taskComplete(retVal, taskManagerAlias)).catch((err) => reject(err));
      });
    });
  }

  static async waitAnyTasks(taskManagerArray) {
    return new Promise((resolve, reject) => {
      const taskComplete = (retVal, alias) => {
        const returnObject = {}
        returnObject[alias] = retVal;
        resolve(returnObject);
      }
      
      taskManagerArray.forEach((taskManager, index) => {
        const taskManagerAlias = taskManager.getAlias();
        taskManager.waitForFinish().then((retVal) => taskComplete(retVal, taskManagerAlias)).catch((err) => reject(err));
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
    const aliasString = `${alias}`
    if(aliasString in Object.values(TaskManager.#aliases)) return false;
    this.#taskAlias = aliasString;
    TaskManager.#aliases[this.getID] = aliasString;
    return true;
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

  async waitForMessageRecieved(messageName) {
    return new Promise((resolve, reject) => {
      this.doOnMessageRecieved(messageName, (data) => resolve(data));
    });
  }

  async waitForMessageRecievedOrThrowOnTimeout(messageName, timeMS) {
    return waitOrThrowOnTimeout(this.waitForMessageRecieved(messageName), timeMS, 'message was not received before timeout');
  }

  async waitForMessageRecievedOrReturnOnTimeout(messageName, timeMS) {
    return waitOrReturnOnTimeout(this.waitForMessageRecieved(messageName), timeMS);
  }

  static async waitAllTasksForMessage(taskManagerArray, messageName) {
    return new Promise((resolve, reject) => {
      let promiseStatus = [];
      let retValMap = {};
  
      const taskComplete = (retVal, alias) => {
        promiseStatus.push(alias);
        retValMap[alias] = retVal;
        if(promiseStatus.length === taskManagerArray.length){
          resolve(retValMap);
        }
      }
      
      taskManagerArray.forEach((taskManager) => {
        const taskManagerAlias = taskManager.getAlias();
        taskManager.messageName(messageName).then((retVal) => taskComplete(retVal, taskManagerAlias)).catch((err) => reject(err));
      });
    });
  }

  static async waitAnyTasksForMessage(taskManagerArray, messageName) {
    return new Promise((resolve, reject) => {
      const taskComplete = (retVal, alias) => {
        const returnObject = {}
        returnObject[alias] = retVal;
        resolve(returnObject);
      }
      
      taskManagerArray.forEach((taskManager, index) => {
        const taskManagerAlias = taskManager.getAlias();
        taskManager.waitForMessageRecieved(messageName).then((retVal) => taskComplete(retVal, taskManagerAlias)).catch((err) => reject(err));
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

module.exports = { $t, $et, $tfile, Task, TaskManager, MessageTaskManager, EasyTaskManager, waitAll, waitOrThrowOnTimeout, waitOrReturnOnTimeout };