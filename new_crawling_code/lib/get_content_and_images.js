'use strict';

const path = require('path');
const Promise = require('./promise');
const uploadToS3 = require('./upload_to_s3');

module.exports = (page, mongoId, partialUrl) => {
    page('table')
        .addClass('bordered')
        .wrap('<div class="article-table"></div>')
        .each(function(i, el) {
            page(el).attr('id', 'T' + (i + 1).toString());
        });

    page('h3')
        .addClass('article-header-1')
        .wrap('<div class="section-container"></div>');

    page('h4')
        .addClass('article-header-2');

    page('.figure')
        .addClass('full-text-image-container');

    page('img')
        .addClass('full-text-image')
        .attr('width', '')
        .attr('height', '');

    return Promise.all(page('.content')
        .find('.figure')
        .toArray()
        .map((el, index) => {
            const id = index + 1;
            const img = page(el).children('img');
            const url = partialUrl + img.attr('src');
            const filename = `${mongoId}_f${id}${path.extname(url)}`;
            const text = page(el).text().replace(/Figure \d\./g, '').trim();
            console.log('--> url', url);
            return uploadToS3(url, `paper_figures/${filename}`)
                .then((data) => img.attr('src', data.Location))
                .then(() => {
                    return {
                        id: `F${id}`,
                        label: `Figure ${id}.`,
                        caption: text,
                        file: filename
                    };
                });
        }))
        .then((figures) => Object.assign({
            content: page('.content').html(),
            figures
        }));
};
