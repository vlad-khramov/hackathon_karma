'use strict';

//import assertBnEq from "helpers/assertBigNumbersEqual";

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

  });

});
