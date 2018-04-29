import sys
import pandas as pd
import xgboost as xgb


loans = pd.read_json(sys.argv[1])

test = loans.groupby(0)[[1, 2]].sum()
test = test.rename(columns={1: 'loans_tokens_sum', 2: 'loans_days_sum'})
test.index.rename('id', inplace=True)

test['loans_count'] = loans.groupby(0)[1].count()
test['success_loans_count'] = loans[loans[3] == True].groupby(0)[1].count()
test['avg_tokens'] = test['loans_tokens_sum'] / test['loans_count']
test['avg_days'] = test['loans_days_sum'] / test['loans_count']


bst = xgb.Booster()
bst.load_model('../models/model.bin')

print(bst.predict(xgb.DMatrix(test))[0])