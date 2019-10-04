require 'nokogiri'
require 'open-uri'
require 'pry'

class Scraper
    

    USA_URL = "https://www.usatoday.com/entertainment/books/best-selling/"
    USA_TODAY_URL = "https://www.usatoday.com"

    def self.scrape_usa
        html = open(USA_URL)
        doc = Nokogiri::HTML(html)
        doc.css("div.front-booklist-info-container").each do |book_element|
            title = book_element.css(".books-front-meta-title").text
            url = book_element.css(".front-booklist-image-rating-container a").attribute("href").value
            Book.new(title, url)
        end
    end

    def self.scrape_book(book)
        return if !!book.description
        html = open(USA_TODAY_URL+book.url)
        doc = Nokogiri::HTML(html)
        book.title = doc.css(".books-stories-meta-title").text
        book.author = doc.css(".books-stories-meta-author").text.strip
        book.this_weeks_ranking = doc.css("div.story-book-ranking-content p.book-this-week-number").text.split.last
        book.description = doc.css(".asset-double-wide.double-wide.NonReviewedBook p").map {|p| p.text}.last
        book.genre = doc.css(".books-stories-meta-genre").text.capitalize.split.last
        book.weeks_listed = doc.css(".book-last-week-count").text
          
    end

end

# title - .css(".books-stories-meta-title").text
#by_author - .css(".books-stories-meta-author").text.strip
# this_weeks_ranking - doc.css("div.story-book-ranking-content p.book-this-week-number").text.split.last
#review_url - doc.css("div.story-asset.goodreads-asset a").attribute("href").value
#genre - doc.css(".books-stories-meta-genre").text.split.last

