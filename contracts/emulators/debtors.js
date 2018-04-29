const Loans = artifacts.require('Loans');

const DEBTORS_START = 10;
const DEBTORS_COUNT = 100;

const EXPERTS_START = 110;
const EXPERTS_COUNT = 40;

const CREDITORS_START = 150;
const CREDITORS_COUNT = 150;

const TOTAL_COUNT = 300;

/***************************************************************/

const accounts = web3.eth.accounts;
let currentExpert = 0;
let currentCreditor = 0;

let debtorsParams = {};
let debtorsMap = {};
let instance;



/***************************************************************/

function expertScoringStrategy() {

}

function expertRandomStrategy() {
  let rand = Math.random().toPrecision(10);
  return rand > 0.5 ? rand : 0;
}

/***************************************************************/

function loanRequestHandler(error, result) {
  if (error) return;

  console.log(`LoanRequest.\t\tid: ${result.args.id},\tdebtor: ${result.args.debtor},\tdays: ${result.args.daysCount},\ttokens: ${result.args.tokensCount}`);

  currentExpert = ++currentExpert % EXPERTS_COUNT;
  currentCreditor = ++currentCreditor % CREDITORS_COUNT;

  let expertId = EXPERTS_START + currentExpert;
  let creditorId = CREDITORS_START + currentCreditor;

  if (expertId === EXPERTS_START) {
    //ML
  } else {
    let confidence = expertRandomStrategy();
    if (confidence > 0) {
      instance.supportLoan(result.args.id, result.args.tokensCount.mul(confidence), {from: accounts[expertId]});
    }
  }

  instance.acceptRequest(result.args.id, {from: accounts[creditorId]})
}

function loanSupportedHandler(error, result) {
  if (error) return;

  console.log(`LoanSupported.\t\tid: ${result.args.id},\tdebtor: ${result.args.debtor},\texpert: ${result.args.expert}, \ttokens: ${result.args.supportedTokens}`);
}

async function requestAcceptedHandler(error, result) {
  if (error) return;

  console.log(`RequestAccepted.\tid: ${result.args.id},\tdebtor: ${result.args.debtor}, \tcreditor: ${result.args.creditor}`);

  let debtorsParam = debtorsParams[ debtorsMap[result.args.debtor] ];

  let isPayOff = (debtorsParam.request*2 + debtorsParam.days-0.1 + debtorsParam.sum*3)/6;
  if (isPayOff > 0.5) {
    instance.payOffLoan(result.args.id, {from: result.args.debtor})
  } else {
    instance.reportOverdueLoanByDebtor(result.args.id, {from: result.args.debtor});
  }
}

function loanFinishedHandler(error, result) {
  if (error) return;

  console.log(`LoanFinished.\t\tid: ${result.args.id},\tdebtor: ${result.args.debtor},\ttokens: ${result.args.tokensCount},\tdays: ${result.args.daysCount},\tsuccess: ${result.args.isSuccessful}`);
}


/***************************************************************/


module.exports = async function (callback) {
  instance = await Loans.new(false);
  console.log('contract ' + instance.address);

  instance.LoanRequest().watch((error, result) => loanRequestHandler(error, result));
  instance.LoanSupported().watch((error, result) => loanSupportedHandler(error, result));
  instance.RequestAccepted().watch((error, result) => requestAcceptedHandler(error, result));
  instance.LoanFinished().watch((error, result) => loanFinishedHandler(error, result));

  /***************************************************************/

  for (let i = 0; i < TOTAL_COUNT; i++) {
    await instance.buyTokens(1000000, {from: accounts[i]})
  }


  for (let i = DEBTORS_START; i < EXPERTS_START; i++) {
    debtorsMap[accounts[i]] = i;

    debtorsParams[i] = {
      request: Math.random(),
      days: Math.random() + 0.1,
      sum: Math.random()
    };
  }


  let debtorStat = {};
  //debtors
  for (let round = 1; round < 1000; round++) {
    for (let i = DEBTORS_START; i < EXPERTS_START; i++) {
      if (Math.random() * 30 > debtorsParams[i].request) {
        continue;
      }

      if (!debtorStat[i]) debtorStat[i] = 0;
      debtorStat[i] += 1;


      let days, sum;
      for (days = 1; days < 30; days++) {
        if (Math.random() < debtorsParams[i].days) {
          break;
        }
      }

      for (sum = 10; sum < 1000; sum += 10) {
        if (Math.random() * 10 < debtorsParams[i].sum) {
          break;
        }
      }


      await instance.requestLoan(sum, days, {from: accounts[i]});

    }
    console.log(/*debtorStat, */`round ${round}, `, 'debtors count: ', Object.keys(debtorStat).length);
    //await sleep(200)
  }

  await sleep(3000);
  console.log('experts balances');
  for (let i = EXPERTS_START; i < CREDITORS_START; i++) {
    console.log(`${i}\t` + await instance.balanceOf(accounts[i]));

  }

};

/************************************/
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}