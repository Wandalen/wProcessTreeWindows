/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as child_process from 'child_process';
import { getProcessTree, getProcessList, getProcessCpuUsage, ProcessDataFlag, buildProcessTree, filterProcessList } from './index';

const native = require('../binding/windows_process_tree.node');

function pollUntil(makePromise: () => Promise<boolean>, cb: () => void, interval: number, timeout: number): void {
  makePromise().then((success) => {
    if (success) {
      cb();
    } else {
      setTimeout(() => {
        pollUntil(makePromise, cb, interval, timeout - interval);
      }, interval);
    }
  });
}

describe('getRawProcessList', () => {
  it('should throw if arguments are not provided', (done) => {
    assert.throws(() => native.getProcessList());
    done();
  });

  it('should throw if the first argument is not a function', (done) => {
    assert.throws(() => native.getProcessList(1));
    done();
  });

  it('should throw if the second argument is not a number', (done) => {
    assert.throws(() => native.getProcessList(() => {}, 'number'));
    done();
  });

  it('should return a list containing this process', (done) => {
    native.getProcessList((list) => {
      assert.notEqual(list.find(p => p.pid === process.pid), undefined);
      done();
    }, 0);
  });

  it('should handle multiple calls gracefully', (done) => {
    let counter = 0;
    const callback = (list) => {
      assert.notEqual(list.find(p => p.pid === process.pid), undefined);
      if (++counter === 2) {
        done();
      }
    };
    native.getProcessList(callback, ProcessDataFlag.None);
    native.getProcessList(callback, ProcessDataFlag.None);
  });

  it('should return memory information only when the flag is set', (done) => {
    // Memory should be undefined when flag is not set
    native.getProcessList((list) => {
      assert.equal(list.every(p => p.memory === undefined), true);

      // Memory should be a number when flag is set
      native.getProcessList((list) => {
        assert.equal(list.some(p => p.memory > 0), true);
        done();
      }, ProcessDataFlag.Memory);
    }, ProcessDataFlag.None);
  });

  it('should return command line information only when the flag is set', (done) => {
    // commandLine should be undefined when flag is not set
    native.getProcessList((list) => {
      assert.equal(list.every(p => p.commandLine === undefined), true);

      // commandLine should be a string when flag is set
      native.getProcessList((list) => {
        assert.equal(list.every(p => typeof p.commandLine === 'string'), true);
        done();
      }, ProcessDataFlag.CommandLine);
    }, ProcessDataFlag.None);
  });
});

describe('getProcessList', () => {
  let cps;

  beforeEach(() => {
    cps = [];
  });

  afterEach(() => {
    cps.forEach(cp => {
      cp.kill();
    });
  });

  it('should return a list containing this process', (done) => {
    getProcessList(process.pid, (list) => {
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'node.exe');
      assert.equal(list[0].pid, process.pid);
      assert.equal(list[0].memory, undefined);
      assert.equal(list[0].commandLine, undefined);
      done();
    });
  });

  it('should return a list containing this process\'s memory if the flag is set', done => {
    getProcessList(process.pid, (list) => {
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'node.exe');
      assert.equal(list[0].pid, process.pid);
      assert.equal(typeof list[0].memory, 'number');
      done();
    }, ProcessDataFlag.Memory);
  });

  it('should return command line information only if the flag is set', (done) => {
    getProcessList(process.pid, (list) => {
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'node.exe');
      assert.equal(list[0].pid, process.pid);
      assert.equal(typeof list[0].commandLine, 'string');
      // CommandLine is "<path to node> <path to mocha> lib/test.js"
      assert.equal(list[0].commandLine.indexOf('mocha') > 0, true);
      assert.equal(list[0].commandLine.indexOf('lib/test.js') > 0, true);
      done();
    }, ProcessDataFlag.CommandLine);
  });

  it('should return a list containing this process\'s child processes', done => {
    cps.push(child_process.spawn('cmd.exe'));
    pollUntil(() => {
      return new Promise((resolve) => {
        getProcessList(process.pid, (list) => {
          resolve(list.length === 2 && list[0].pid === process.pid && list[1].pid === cps[0].pid);
        });
      });
    }, () => done(), 20, 500);
  });
});

describe('getProcessCpuUsage', () => {

  it('should get process cpu usage', (done) => {
      getProcessCpuUsage([{ pid: process.pid, ppid: process.ppid, name: 'node.exe' }], (annotatedList) => {
        assert.equal(annotatedList.length, 1);
        assert.equal(annotatedList[0].name, 'node.exe');
        assert.equal(annotatedList[0].pid, process.pid);
        assert.equal(annotatedList[0].memory, undefined);
        assert.equal(typeof annotatedList[0].cpu, 'number');
        assert.equal(0 <= annotatedList[0].cpu && annotatedList[0].cpu <= 100, true);
        done();
    });
  });

  it('should handle multiple calls gracefully', function (done: MochaDone): void {
    this.timeout(3000);

    let counter = 0;
    const callback = (list) => {
      assert.notEqual(list.find(p => p.pid === process.pid), undefined);
      if (++counter === 2) {
        done();
      }
    };
    getProcessCpuUsage([{ pid: process.pid, ppid: process.ppid, name: 'node.exe' }], callback);
    getProcessCpuUsage([{ pid: process.pid, ppid: process.ppid, name: 'node.exe' }], callback);
  });
});

describe('getProcessTree', () => {
  let cps;

  beforeEach(() => {
    cps = [];
  });

  afterEach(() => {
    cps.forEach(cp => {
      cp.kill();
    });
  });

  it('should return a tree containing this process', done => {
    getProcessTree(process.pid, (tree) => {
      assert.equal(tree.name, 'node.exe');
      assert.equal(tree.pid, process.pid);
      assert.equal(tree.memory, undefined);
      assert.equal(tree.commandLine, undefined);
      assert.equal(tree.children.length, 0);
      done();
    });
  });

  it('should return a tree containing this process\'s memory if the flag is set', done => {
    getProcessTree(process.pid, (tree) => {
      assert.equal(tree.name, 'node.exe');
      assert.equal(tree.pid, process.pid);
      assert.notEqual(tree.memory, undefined);
      assert.equal(tree.children.length, 0);
      done();
    }, ProcessDataFlag.Memory);
  });

  it('should return a tree containing this process\'s command line if the flag is set', done => {
    getProcessTree(process.pid, (tree) => {
      assert.equal(tree.name, 'node.exe');
      assert.equal(tree.pid, process.pid);
      assert.equal(typeof tree.commandLine, 'string');
      assert.equal(tree.children.length, 0);
      done();
    }, ProcessDataFlag.CommandLine);
  });

  it('should return a tree containing this process\'s child processes (simple)', done => {
    cps.push(child_process.spawn('cmd.exe'));
    pollUntil(() => {
      return new Promise((resolve) => {
        getProcessTree(process.pid, (tree) => {
          resolve(tree.children.length === 1);
        });
      });
    }, () => done(), 20, 500);
  });

  it('should return a tree containing this process\'s child processes (complex)', done => {
    cps.push(child_process.spawn('powershell.exe'));
    cps.push(child_process.spawn('cmd.exe', ['/C', 'powershell.exe']));
    pollUntil(() => {
      return new Promise((resolve) => {
        getProcessTree(process.pid, (tree) => {
          resolve(tree.children.length === 2 &&
            tree.children[0].name === 'powershell.exe' &&
            tree.children[0].children.length === 0 &&
            tree.children[1].name === 'cmd.exe' &&
            tree.children[1].children &&
            tree.children[1].children.length === 1 &&
            tree.children[1].children[0].name === 'powershell.exe');
        });
      });
    }, () => done(), 20, 500);
  });
});

describe('buildProcessTree', () => {
  it('should enforce a maximum search depth', () => {
    const tree = buildProcessTree(0, [
      { pid: 0, ppid: 0, name: '0' }
    ], 3);
    assert.equal(tree.pid, 0);
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].pid, 0);
    assert.equal(tree.children[0].children.length, 1);
    assert.equal(tree.children[0].children[0].pid, 0);
    assert.equal(tree.children[0].children[0].children.length, 1);
    assert.equal(tree.children[0].children[0].children[0].pid, 0);
    assert.equal(tree.children[0].children[0].children[0].children.length, 0);
  });
});

describe('filterProcessList', () => {
  it('should enforce a maximum search depth', () => {
    const list = filterProcessList(0, [
      { pid: 0, ppid: 0, name: '0' }
    ], 3);
    assert.equal(list.length, 4);
    assert.equal(list[0].pid, 0);
    assert.equal(list[1].pid, 0);
    assert.equal(list[2].pid, 0);
    assert.equal(list[3].pid, 0);
  });
});
