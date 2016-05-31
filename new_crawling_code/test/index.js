'use strict';

const extractMedia = require('../lib/extract_media');
const sendToS3 = require('../lib/send_to_s3');

console.log('TESTING');

(() => {
    console.log('--> PDF:');
    const url = 'http://impactaging.com/papers/v8/n5/pdf/100970.pdf';
    const filename = 'advance_figures/test-article.pdf';

    sendToS3(url, filename)
        .then((data) => console.log('PDF success', data))
        .catch((err) => console.log('PDF error', err));

})();

(() => {
    console.log('--> DOCX:');
    const url = 'http://impactaging.com/papers/v8/n5/full/100970/SupData.docx';

    extractMedia(url, 'supplemental_materials/EdDWYH8jbsDR8unjN_sd')
        .then((data) => console.log('DOCX success', data))
        .catch((err) => console.log('DOCX error', err));
})();
