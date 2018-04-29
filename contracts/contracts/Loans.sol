pragma solidity ^0.4.0;

import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';

contract Loans is Ownable {

	using SafeMath for uint256;

    /*********************************************/
    mapping (address=>uint) public balanceOf;
    uint public rate = 1000;

    Loan[] loans;
    mapping(address=>Expert) experts;


    bool isDebug=false;
    uint debugTime;




    /*********************************************/

    uint constant public percentPerDay = 10;


    uint constant public secondsInDay = 60; // for demo is 60

    /*********************************************/

    struct Expert {
        uint supports;
        uint supportsTokens;

        uint successfulSupports;
        uint successfulSupportsTokens;

        uint wrongSupports;
        uint wrongSupportsTokens;
    }


    struct Loan {
        address debtor;
        address creditor;
        uint tokensCount;
        uint tokensCountToReturn;
        uint daysCount;
        uint startTs;
        bool isFinished;
        bool isReturned;

        address expert;
        uint supportedTokens;
    }

    /*********************************************/

    event LoanRequest(uint id, address debtor, uint tokensCount, uint daysCount);
    event LoanSupported(uint id, address debtor, address expert, uint supportedTokens);
    event RequestAccepted(uint id, address debtor, address creditor);
    event LoanFinished(uint id, address debtor, uint tokensCount, uint daysCount, bool isSuccessful, address expert, uint supportedTokens);

    /*********************************************/
    function Loans(bool _isDebug) public {
        isDebug=_isDebug;
    }

    /*********************************************/

    function buyTokens(uint _count) external {
        // for testing purposes it costs 0 ether

        balanceOf[msg.sender] = balanceOf[msg.sender].add(_count);
    }

    /// debtor
    function requestLoan(uint _tokensCount, uint _days) external {
        require(_tokensCount > 0);

        uint tokenCountToReturn =_tokensCount + _tokensCount.mul(_days).mul(percentPerDay)/100;

        loans.push(
            Loan(
                msg.sender,
                address(0),
                _tokensCount,
                tokenCountToReturn,
                _days,
                0,
                false,
                false,

                address(0),
                0
            )
        );

        emit LoanRequest(loans.length-1, msg.sender, tokenCountToReturn, _days);
    }

    /// expert
    function supportLoan(uint _id, uint _tokensCount) external {
        require(_tokensCount > 0);

        requireLoanExists(_id);
        requireLoanNotStarted(_id);
        require(loans[_id].expert == address(0));

        require(balanceOf[msg.sender] >= _tokensCount);

        loans[_id].expert = msg.sender;
        loans[_id].supportedTokens = _tokensCount;

        balanceOf[msg.sender] = balanceOf[msg.sender].sub(_tokensCount);
        experts[msg.sender].supports +=1;
        experts[msg.sender].supportsTokens = experts[msg.sender].supportsTokens.add(_tokensCount);

        emit LoanSupported(_id, loans[_id].debtor, loans[_id].expert, loans[_id].supportedTokens);
    }

    /// creditor
    function acceptRequest(uint _id) external {
        requireLoanExists(_id);
        requireLoanNotStarted(_id);

        require(balanceOf[msg.sender] >= loans[_id].tokensCount);

        loans[_id].startTs = getCurrentTime();
        loans[_id].creditor = msg.sender;
        transferTokens(loans[_id].debtor, loans[_id].tokensCount);

        emit RequestAccepted(_id, loans[_id].debtor, loans[_id].creditor);
    }

    /// debtor
    function payOffLoan(uint _id) external {
        requireLoanExists(_id);
        requireLoanStarted(_id);
        requireLoanNotFinished(_id);

        require(msg.sender == loans[_id].debtor);
        require(balanceOf[msg.sender] >= loans[_id].tokensCountToReturn);
        require(loans[_id].startTs + loans[_id].daysCount*secondsInDay > getCurrentTime());

        loans[_id].isFinished = true;
        loans[_id].isReturned = true;

        if (loans[_id].expert == address(0)) {
            transferTokens(loans[_id].creditor, loans[_id].tokensCountToReturn);
        } else {
            transferTokens(loans[_id].creditor, loans[_id].tokensCount);


            uint percents = loans[_id].tokensCountToReturn.sub(loans[_id].tokensCount);

            uint creditorPercents = percents
            .mul(loans[_id].tokensCountToReturn)
            .div(
                loans[_id].supportedTokens.add(loans[_id].tokensCountToReturn)
            );

            transferTokens(loans[_id].creditor, creditorPercents);
            transferTokens(loans[_id].expert, percents.sub(creditorPercents));


            balanceOf[loans[_id].expert] = balanceOf[loans[_id].expert].add(
                loans[_id].supportedTokens
            );

            experts[loans[_id].expert].successfulSupports += 1;
            experts[loans[_id].expert].successfulSupportsTokens = experts[loans[_id].expert].successfulSupportsTokens.add(
                loans[_id].supportedTokens
            );
        }

        emit LoanFinished(_id, loans[_id].debtor, loans[_id].tokensCountToReturn, loans[_id].daysCount, true, loans[_id].expert, loans[_id].supportedTokens);
    }

    /// debtor
    /// for simplified emulation
    function reportOverdueLoanByDebtor(uint _id) external {
        requireLoanExists(_id);
        requireLoanStarted(_id);
        requireLoanNotFinished(_id);

        loans[_id].isFinished = true;

        if (loans[_id].expert != address(0)) {
            uint creditorTokens = loans[_id].supportedTokens
                .mul(loans[_id].supportedTokens)
                .div(
                    loans[_id].supportedTokens.add(loans[_id].tokensCountToReturn)
                );

            balanceOf[loans[_id].creditor] = balanceOf[loans[_id].creditor].add(creditorTokens);
            balanceOf[loans[_id].expert] = balanceOf[loans[_id].expert].add(
                loans[_id].supportedTokens.sub(creditorTokens)
            );

            experts[loans[_id].expert].wrongSupports += 1;
            experts[loans[_id].expert].wrongSupportsTokens = experts[loans[_id].expert].wrongSupportsTokens.add(
                loans[_id].supportedTokens
            );
        }



        emit LoanFinished(_id, loans[_id].debtor, loans[_id].tokensCountToReturn, loans[_id].daysCount, false, loans[_id].expert, loans[_id].supportedTokens);
    }

    /// creditor
    function reportOverdueLoan(uint _id) external {
        requireLoanExists(_id);
        requireLoanStarted(_id);
        requireLoanNotFinished(_id);

        require(loans[_id].startTs + loans[_id].daysCount*secondsInDay < getCurrentTime());

        loans[_id].isFinished = true;

        if (loans[_id].expert != address(0)) {
            uint creditorTokens = loans[_id].supportedTokens
                .mul(loans[_id].supportedTokens)
                .div(
                    loans[_id].supportedTokens.add(loans[_id].tokensCountToReturn)
                );

            balanceOf[loans[_id].creditor] = balanceOf[loans[_id].creditor].add(creditorTokens);
            balanceOf[loans[_id].expert] = balanceOf[loans[_id].expert].add(
                loans[_id].supportedTokens.sub(creditorTokens)
            );

            experts[loans[_id].expert].wrongSupports += 1;
            experts[loans[_id].expert].wrongSupportsTokens = experts[loans[_id].expert].wrongSupportsTokens.add(
                loans[_id].supportedTokens
            );
        }

        emit LoanFinished(_id, loans[_id].debtor, loans[_id].tokensCountToReturn, loans[_id].daysCount, false, loans[_id].expert, loans[_id].supportedTokens);
    }


    function transferTokens(address _to, uint _count) public {
        require(_to != address(0));
        require(balanceOf[msg.sender] >= _count);

        balanceOf[msg.sender] -= _count;
        balanceOf[_to] = balanceOf[_to].add(_count);
    }

    function  getCurrentTime() public  view returns (uint) {
        if (isDebug) {
            return debugTime;
        } else {
            return now;
        }
    }

    function  setDebugTime(uint _time) public onlyOwner {
        debugTime = _time;
    }


    /*********************************************/

    function requireLoanExists(uint _id) private view {
        require(_id < loans.length);
    }

    function requireLoanStarted(uint _id) private  view {
        requireLoanExists(_id);
        require(loans[_id].startTs > 0);
    }

    function requireLoanNotStarted(uint _id) private  view {
        requireLoanExists(_id);
        require(loans[_id].startTs == 0);
    }

    function requireLoanNotFinished(uint _id) private  view {
        requireLoanExists(_id);
        require(!loans[_id].isFinished);
    }




}
