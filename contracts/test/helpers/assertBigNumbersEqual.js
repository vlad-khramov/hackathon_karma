const assertBnEq = (a, b, message) =>  {
  assert(a.eq(b), `${message} (${a.valueOf()} != ${b.valueOf()})`)
};


export default assertBnEq;