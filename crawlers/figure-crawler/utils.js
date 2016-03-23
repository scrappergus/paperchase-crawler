'use strict'

/*
	EX: zip([1,2,3], [4,5,6], (n1, n2) => n1 + n2) //=> [5,7,9]
*/
exports.zip = function(arr1, arr2, fn) {
  var arr = []
  var i
  for (i = 0; i < arr1.length; i += 1) {
    arr.push(fn(arr1[i], arr2[i]))
  }
  return arr
}
