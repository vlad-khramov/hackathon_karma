var Loans = artifacts.require("./Loans.sol");

module.exports = function(deployer) {
  deployer.then(function() {
    return Loans.new(false);
  }).then(function(instance) {

    console.log('loans: ok ' + instance.address);

  })
};
