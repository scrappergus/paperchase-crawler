'use strict';

// assign properties not already set on the first object from the second object
module.exports = (obj1, obj2) => Object.keys(obj2)
    .reduce((obj, key) => {
        if (obj[key] === undefined || obj[key] === null && obj2[key] !== undefined) {
            obj[key] = obj2[key];
        }
        return obj;
    }, Object.assign({}, obj1));
