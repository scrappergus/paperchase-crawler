'use strict';

const getAuthors = (page) => {
    return page('.author').first().html()
        .replace(/\r\n\s+/, ' ')
        .split('</sup>,')
        .map((string) => string.trim())
        .map((string) => {
            const afsMatch = string.match(/<sup>([^<]*)\s?(<|$)/);
            const affiliations = afsMatch && afsMatch[1].split(',')
                .map((intAsString) => Number(intAsString) - 1);
            const authMatch = string.match(/([^<]*)<sup>/);
            const authorName = authMatch && authMatch[1].trim().split(' ');
            return {
                affiliations_numbers: affiliations,
                name_first: authorName[0],
                name_last: authorName[1]
            };
        });
};

const getAfilliations = (page) => {
    return page('.org').toArray().map((el) => {
        return page(el).html()
            .replace(/<sup>.*<\/sup>/, '')
            .replace(/\r\n\s+/, ' ');
    });
};


const getDates = (page) => {
    const string = page('.data').text().split(' ').map((word) => {
        return word.trim();
    }).join(' ').replace(/\s\s+/g, ' ').trim();

    const receivedMatch = string.match(/Received: ([^;]*)(;|$)/);
    const acceptedMatch = string.match(/Accepted: ([^;]*)(;|$)/);
    const publishedMatch = string.match(/Published: ([^;]*)(;|$)/);

    return {
        received: receivedMatch && receivedMatch[1],
        accepted: acceptedMatch && acceptedMatch[1],
        published: publishedMatch && publishedMatch[1]
    };

};

module.exports = (page) => {
    const dates = getDates(page);
    const authors = getAuthors(page);
    const affiliations = getAfilliations(page);
    const correspondence = page('.vcard').children('dd').text().trim();
    const keywords = page('.meta').find('dd').toArray().slice(0, 2).map((el) => {
        return page(el).text().split(',').map((keyword) => {
            return keyword.trim().replace(/\s\s+/g, '');
        });
    }).reduce((flattened, arr) => flattened.concat(arr));

    return {
        authors,
        affiliations,
        keywords,
        correspondence: [correspondence],
        dates: {
            epub: dates.published
        },
        history: {
            received: dates.received,
            accepted: dates.accepted
        }
    };
};
