'use strict';

const getAuthors = (page) => {
    return page('.author').first().html()
        .replace(/\r\n\s+/, ' ')
        .replace(/and\s+/, ', ')
        .split(', ')
        .map((string) => string.trim())
        .map((string) => {
            const afsMatch = string.match(/<sup>([^<]*)\s?(<|$)/);
            if(afsMatch) {
                var affiliations = afsMatch && afsMatch[1].split(',')
                    .map((intAsString) => {
                            if(intAsString == '*') {
                                return '*';
                            }
                            else {
                                return Number(intAsString) - 1;
                            }
                    });

                var authMatch = string.match(/([^<]*)<sup>/);
            }
            else {
                var affiliations_numbers = [];
                var authMatch = [null, string];
            }


            const authorName = authMatch && authMatch[1].trim().split(' ');

            return {
                affiliations_numbers: affiliations,
                name_first: authorName[0],
                name_middle: authorName[1],
                name_last: authorName[2]
            };
        });
};

const getAffilliations = (page) => {
    return page('.org').toArray().map((el) => {
        return page(el).html()
            .replace(/<sup>.*<\/sup>/, '')
            .replace(/\r\n\s+/, ' ');
    });
};


const getDates = (page) => {
    if(page('.data')) {
        var string = page('.data').text().split(' ').map((word) => {
                return word.trim();
            }).join(' ').replace(/\s\s+/g, ' ').trim();
    }
    else {
        var string = page('.content').text().split(' ').map((word) => {
                return word.trim();
            }).join(' ').replace(/\s\s+/g, ' ').trim();
    }



    const receivedMatch = string.match(/Received: ([^;]*)(;|$)/)
    const acceptedMatch = string.match(/Accepted: ([^;]*)(;|$)/);
    const publishedMatch = string.match(/Published: ([^;]*)(;|$)/);

    var dateObj = {};
    if(receivedMatch) {
        dateObj.received = receivedMatch[1].split('Published')[0].split('Accepted')[0];
    }
    if(acceptedMatch) {
        dateObj.accepted = receivedMatch[1].split('Published')[0].split('Accepted')[0];
    }
    if(publishedMatch) {
        dateObj.published = receivedMatch[1].split('Published')[0].split('Accepted')[0];
    }

    return dateObj;

};

const getKeywords = (page) => {
    var keys = [];
    var string = page('.meta').find('dd').toArray().slice(0, 2).map((el) => {
            return page(el).text().split(',').map((keyword) => {
                    return keyword.trim().replace(/\s\s+/g, '');
                });
        });

    if(string.length == 0) {
        var textMatch = page("i:contains('Keywords:')").parent().next('i');
        if(textMatch) {
            page(textMatch).text().split(',').map((keyword) => {
                    keys.push(keyword.trim().replace('Keywords:', ''));
                });
        }
    }

    return keys;

    if(string.length > 0) {
        string.reduce((flattened, arr) => flattened.concat(arr));
    }
}

const getCorrespondence = (page) => {
    var corr = {};
    if(page('.vcard')) {
        var corr = page('.vcard').children('dd').text().trim();
        corr = corr.replace("E-mail:", 'email');
        var corrParts = corr.split('email');
        return [{text: corrParts[0].trim().replace(';', ''),
            email: corrParts[1].trim()
        }];
    }

    var match = page('.vcard').children('dd').text().trim();
    if(!match) {
        var match = page('.content').text().match(/Correspondence:.*/);
        if(match) {
            var textMatch = match[0].match(/Correspondence:[^\r]*/);
            if(textMatch) {
                var text = textMatch[0].replace('Correspondence:','').trim();    
                corr.text = text;
            }

            var emailMatch = match['input'].match(/Email:[^\r]*/);
            if(emailMatch) {
                var email = emailMatch[0].replace('Email:','').trim();
                corr.email = email;
            }
        }
    }


    return [corr];
}



const getFullText = (page, contentData) => {
    var sections = [],
    refs = [];

    page('#bibliography li').toArray().map((el, index) => {
            var ref = page(el).html().replace(/\r\n+/, '');

            refs.push({
                    'number': (index+1),
                    'asString' : ref
                });
        });

    for(var refIdx=0; refIdx < refs.length; refIdx++) {
        var ref = refs[refIdx];

        page('[href=#bibl_'+(refIdx+1)+']').attr('href', "#R"+(refIdx+1))
    }

    var title = '';
    var secContent = '';
    var sectionBreaks = 1;

    page('.content h3').each((index, el) => {
            if(page(el).hasClass('article-header-1') && !page(el).text().match('REFERENCES')) {
                var content = [];
                page(el).nextUntil('.article-header-1').each(function(idx, ell) {
                        var subContent = {}

                            if(page(ell).hasClass('article-header-2')) {
                                subContent.contentType = 'subsection';
                                subContent.headerLevel = 2;
                                subContent.title = page(ell).html();
                            }
                            else if(page(ell).hasClass('article-table')) {
                                console.log('found a table');
                                subContent.contentType = 'table';
                                subContent.content = page(ell).html();
                            }
                            else if(page(ell).hasClass('full-text-image-container')) {
                                for (var figIdx=0; figIdx < contentData.figures.length; figIdx++) {
                                    var fig = contentData.figures[figIdx];

                                    if(fig !== undefined) {
                                        if(page(ell).html().indexOf(fig.file) > 0) {
                                            subContent = {
                                                contentType: 'figure',
                                                content: {
                                                    caption: fig.caption,
                                                    id: fig.id,
                                                    label: fig.label,
                                                    url: "https://s3-us-west-1.amazonaws.com/paperchase-aging/paper_figures/"+fig.file
                                                }
                                            };
                                        }
                                    }
                                }
                            }
                            else {
                                subContent.contentType = 'p';
                                subContent.content = page(ell).html();
                            }

                        content.push(subContent);
                    });


                var section = {
                    title: page(el).text(),
                    headerLevel:1,
                    content: content
                };

                sections.push(section);
            }
        });

    return {
        sections: sections,
        acks: [],
        references:refs
    };
}


module.exports = (page, contentData) => {
    const dates = getDates(page);
    const authors = getAuthors(page);
    const affiliations = getAffilliations(page);
    const correspondence = getCorrespondence(page);

    const fulltext = getFullText(page, contentData);

    const keywords = getKeywords(page);

    return {
        authors,
        affiliations,
        keywords,
        articleJson: fulltext,
        correspondence: correspondence,
        dates: {
            epub: dates.published
        },
        history: {
            received: dates.received,
            accepted: dates.accepted
        }
    };
};
