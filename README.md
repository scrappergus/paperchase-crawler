Paperchase Crawler
========================
The crawler is used to send data to Paperchase for creating the database, crawling PMC for article assets, DOI status, utility tools etc..

App Structure
============
Functions
----
Within /methods

Crawlers
----
Within /crawlers

Endpoints
============
Notes about the different endpoints.

Figures
----
/crawl_figures/:journalname/:pii

XML
----
**/crawl_xml/:journalname/**
 - Batch crawler to upload all journal PMC XML to S3
**/get_article_pmc_xml/:journalname/:articleMongoId**
 - Per article, get PMC article XML

PDF
----
**/crawl_pdf/:journalname/**
Batch crawler to upload all journal PDF via PMC to S3
**/get_article_pmc_pdf/:journalname/:articleMongoId**
Per article

DOI
----
These use CrossRef’s API
**/doi_status/:journalname/**
DOI Status - for ALL articles in journal
**/article/:journalname/:pii/doi_status**
DOI Status - per article

PubMed
----
**/titles/:journalname**
**/pubmed/all_titles_and_all_ids/:journalname**
Returns all IDs and title for all articles in a journal at PubMed
Might timeout for large archives
**/pubmed/ids_via_pii/:journalname/:pii**
**/ncbi/article_count/:db/:journalname/**

NCBI & Legacy
----
**/pmid_pii_pairs/:journalname**
For creating PMID/PII pairs file, to update article recordsa at PubMed to include PII
Use the legacy DB to get PII/title and use PubMed to get PMID/title. Matched PII/PMID will be pushed to an array. Then this will be used to create the output pairs file. Unmatched PMID are logged in the console
Pairs file (extension .pii) are uploaded to NCBI’s FTP Server in the /pid folder
More details: http://www.ncbi.nlm.nih.gov/books/NBK3812/#ft.AddingChanging_DOIPII_in_PubMed_Recor
How it works:
 - Gets title/PMID via PubMed, via ncbi.allArticlesTitleAndPMID()
 - Gets title/all IDs via legacy, via legacy.getAllArticlesIdAndTitle()
 - Matches titles and IDs, via shared.matchPmidAndPii()

**/pmid_doi_pairs/:journalname**
For creating PMID/DOI pairs file, to update article recordsa at PubMed to include DOI. This will first use the same pattern as **/pmid_pii_pairs/:journalname** for matching PII to PMID. Then using PII, the DOI is checked to see if registered. If registerd, then added to pairs file

Paperchase Setup
----
**/initiate_articles_collection/:journalname**

Articles Collection: for getting PMID, PII, title into MongoLab DB. Sends to Paperchase to insert so that _id has same type. Via shell _id is Object. Via Mongo default is strig. the rest of the data is process in Paperchase via articleMethods.processXML

**/articles_epub_legacy/:journalname**

**/fill_in_articles_from_pubmed/:journalname**

**/fill_in_articles_from_legacy/:journalname**

**/article_ids_via_pmid/:pmid**

**/article_info_via_pmid/:pmid**

