'use strict';

import expectThrow from "./helpers/expectThrow.js";
import {withRollback} from "./helpers/EVMSnapshots";
import assertBnEq from "./helpers/assertBigNumbersEqual";

const Loans = artifacts.require("Loans.sol");
const l = console.log;

contract('Loans', function (accounts) {

  const role = {
    owner: accounts[1],
    debtor1: accounts[2],
    creditor1: accounts[3],
    expert1: accounts[4]
  };


  let instance;

  beforeEach(async function () {

    instance = await Loans.new(
      true,
      {
        from: role.owner
      }
    );
  });

  it("complex test", async function () {
    let startTime = new Date() / 1000;
    let beforeDeadLine = startTime + 60*3 - 1;
    let afterDeadLine = startTime + 60*3 + 1;

    await instance.setDebugTime(startTime, {from: role.owner});

    assert.equal(0, await instance.balanceOf(role.creditor1));
    assert.equal(0, await instance.balanceOf(role.expert1));
    await instance.buyTokens(10000, {from: role.creditor1});
    await instance.buyTokens(10000, {from: role.expert1});
    assert.equal(10000, await instance.balanceOf(role.creditor1));
    assert.equal(10000, await instance.balanceOf(role.expert1));


    await instance.requestLoan(1000, 3, {from: role.debtor1});

    await instance.supportLoan(0, 3000, {from: role.expert1});
    assert.equal(7000, await instance.balanceOf(role.expert1));


    await instance.acceptRequest(0, {from: role.creditor1});
    assert.equal(9000, await instance.balanceOf(role.creditor1));
    assert.equal(1000, await instance.balanceOf(role.debtor1));

    await instance.setDebugTime(beforeDeadLine, {from: role.owner});
    await expectThrow(instance.reportOverdueLoan(0));

    // payed
    await withRollback(async () => {

      await expectThrow(instance.payOffLoan(0, {from: role.creditor1}));
      await expectThrow(instance.payOffLoan(0, {from: role.debtor1}));

      await instance.buyTokens(300, {from: role.debtor1});
      await instance.payOffLoan(0, {from: role.debtor1});
      assert.equal(0, await instance.balanceOf(role.debtor1));
      assertBnEq(10090, await instance.balanceOf(role.creditor1)); // 300*1300/(1300+3000)
      assertBnEq(10210, await instance.balanceOf(role.expert1));

    });

    // not payed
    await instance.setDebugTime(afterDeadLine, {from: role.owner});
    await instance.buyTokens(300, {from: role.debtor1});
    await expectThrow(instance.payOffLoan(0, {from: role.debtor1}));

    await instance.reportOverdueLoan(0);
    assertBnEq(9000 + 906, await instance.balanceOf(role.creditor1)); // 300*1300/(1300+3000)
    assertBnEq(7000 + 2094, await instance.balanceOf(role.expert1));

  });

});
