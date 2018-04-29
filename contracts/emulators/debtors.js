const Loans = artifacts.require('Loans');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const readline = require('readline');


const DEBTORS_START = 10;
const DEBTORS_COUNT = 200;

const EXPERTS_START = 210;
const EXPERTS_COUNT = 40;

const CREDITORS_START = 250;
const CREDITORS_COUNT = 50;

const TOTAL_COUNT = 300;

/***************************************************************/

const accounts = web3.eth.accounts;
let currentExpert = 0;
let currentCreditor = 0;

let debtorsParams = {};
let accountsMap = {};
let instance;

let loans = [];
let loansByDebtor={};

let expertStats = {};

let loansCount = 0;
let loansSuccessCount = 0;
let loansTokensCount = 0;
let loansSuccessTokensCount = 0;


/***************************************************************/

async function expertScoringStrategy(debtor, loanSum) {
  if (!loansByDebtor[debtor]) {
    return 0;
  }

  let fn = `/tmp/train${Math.random()}.json`;

  await fs.writeFile(fn, JSON.stringify(loansByDebtor[debtor]), 'utf8', x=>x);

  const { stdout, stderr } = await exec('python3 ../scoring/score.py ' + fn, '../scoring/');

  if (stderr) {
    return 0;
  }

  try {
    let score = parseFloat(stdout);
    if (score< 0.5) {
      return 0;
    }

    return loanSum.mul((parseFloat(stdout)-0.5)*2);
  } catch (e) {
    return 0;
  }

}

/**
 * Random expert strategy.
 */
function expertRandomStrategy() {
  let rand = Math.random();
  return rand > 0.5 ? ((rand-0.5)*2).toPrecision(10) : 0;
}

/***************************************************************/

async function loanRequestHandler(error, result) {
  if (error) return;

  log(`LoanRequest.\t\tid: ${result.args.id},\tdebtor: ${result.args.debtor},\tdays: ${result.args.daysCount},\ttokens: ${result.args.tokensCount}`);

  currentExpert = ++currentExpert % EXPERTS_COUNT;
  currentCreditor = ++currentCreditor % CREDITORS_COUNT;

  let expertId = EXPERTS_START + currentExpert;
  let creditorId = CREDITORS_START + currentCreditor;

  let supportSum = 0;
  if (expertId === EXPERTS_START) {
    supportSum = await expertScoringStrategy(result.args.debtor, result.args.tokensCount);
  } else {
    let confidence = expertRandomStrategy();
    supportSum = result.args.tokensCount.mul(confidence);
  }

  if (supportSum > 0) {
    instance.supportLoan(result.args.id, supportSum, {from: accounts[expertId]}).catch(x=>x);// sometimes accept below can run earlier. It is norm
  }

  instance.acceptRequest(result.args.id, {from: accounts[creditorId]})
}

function loanSupportedHandler(error, result) {
  if (error) return;

  log(`LoanSupported.\t\tid: ${result.args.id},\tdebtor: ${result.args.debtor},\texpert: ${result.args.expert}, \ttokens: ${result.args.supportedTokens}`);

  expertStats[result.args.expert].supported++;
  expertStats[result.args.expert].supportedTokens+=parseInt(result.args.supportedTokens);
}

async function requestAcceptedHandler(error, result) {
  if (error) return;

  log(`RequestAccepted.\tid: ${result.args.id},\tdebtor: ${result.args.debtor}, \tcreditor: ${result.args.creditor}`);

  let debtorsParam = debtorsParams[ accountsMap[result.args.debtor] ];

  let isPayOff = (debtorsParam.request + debtorsParam.days*2 + debtorsParam.sum*3)/6;

  if (isPayOff > 0.4 + Math.random()/5) {
    instance.payOffLoan(result.args.id, {from: result.args.debtor})
  } else {
    instance.reportOverdueLoanByDebtor(result.args.id, {from: result.args.debtor});
  }
}

function loanFinishedHandler(error, result) {
  if (error) return;

  log(`LoanFinished.\t\tid: ${result.args.id},\tdebtor: ${result.args.debtor},\ttokens: ${result.args.tokensCount},\tdays: ${result.args.daysCount},\tsuccess: ${result.args.isSuccessful}`);

  let data = [
    result.args.debtor,
    result.args.tokensCount,
    result.args.daysCount,
    result.args.isSuccessful
  ];

  loans.push(data);

  if (!loansByDebtor[result.args.debtor]) {
    loansByDebtor[result.args.debtor] = [];
  }
  loansByDebtor[result.args.debtor].push(data);

  loansCount++;
  loansTokensCount += parseInt(result.args.tokensCount);
  if (result.args.isSuccessful) {
    if (result.args.expert && '0x0000000000000000000000000000000000000000'!==result.args.expert) {
      expertStats[result.args.expert].success++;
      expertStats[result.args.expert].successTokens += parseInt(result.args.supportedTokens);
    }

    loansSuccessCount++;
    loansSuccessTokensCount += parseInt(result.args.tokensCount);
  }

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
    accountsMap[accounts[i]] = i;
    await instance.buyTokens(1000000, {from: accounts[i]})
  }

  for (let i = EXPERTS_START; i < CREDITORS_START; i++) {
    expertStats[accounts[i]] = {
      supported: 0,
      supportedTokens: 0,
      success: 0,
      successTokens: 0
    };
  }


  for (let i = DEBTORS_START; i < EXPERTS_START; i++) {
    debtorsParams[i] = {
      request: Math.random(),
      days: Math.random(),
      sum: Math.random()
    };
  }


  let debtorStat = {};
  //debtors
  for (let round = 1; round <= 1000; round++) {
    for (let i = DEBTORS_START; i < EXPERTS_START; i++) {
      if (Math.random() * 30 > debtorsParams[i].request) {
        continue;
      }

      if (!debtorStat[i]) debtorStat[i] = 0;
      debtorStat[i] += 1;


      let days, sum;
      for (days = 1; days < 30; days++) {
        if (Math.random() < debtorsParams[i].days + 0.1) {
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
    console.log('\x1Bc');
    console.log(`Round: ${round}/${1000}`);
    console.log(`Issued:\t\tloans:\t${loansCount}\tTokens:\t${loansTokensCount}\tUnique debtors:\t${Object.keys(debtorStat).length}`);
    console.log(`Returned:\tloans:\t${loansSuccessCount}\tTokens:\t${loansSuccessTokensCount}`);


    console.log('');
    console.log('Experts (success supports/supported) (success supports tokens/supported tokens)');


    let expertsLog = '';


    for (let i = EXPERTS_START, nl=0; i < CREDITORS_START; i++, nl++) {
      let expStat = expertStats[ accounts[i] ];
      let expName = i===EXPERTS_START ? 'scoring' : 'random';
      expertsLog += `${expName}#${i}:(${expStat.success.toString().padStart(3, ' ')}/${expStat.supported.toString().padStart(3, ' ')}) (${expStat.successTokens.toString().padStart(5, ' ')}/${expStat.supportedTokens.toString().padStart(5, ' ')})\t\t`;
      if (nl%4===0) {
        expertsLog+='\n'
      }
    }
    console.log(expertsLog);
  }

  console.log('');
  console.log('Result experts balances (initial balance was 1000000)');

  let expertsBalanceLog = '';


  for (let i = EXPERTS_START, nl=0; i < CREDITORS_START; i++, nl++) {
    let expName = i===EXPERTS_START ? 'scoring' : 'random';
    expertsBalanceLog += `${expName}#${i}:${await instance.balanceOf(accounts[i])}\t\t`;
    if (nl%4===0) {
      expertsBalanceLog+='\n'
    }
  }
  console.log(expertsBalanceLog);


  await fs.writeFile('./artifacts/train.json', JSON.stringify(loans), 'utf8', x=>x);

};

/************************************/
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
  // console.log(message)
}
