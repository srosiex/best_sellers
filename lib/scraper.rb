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
            author = book_element.css(".books-front-meta-authorInfo").text
            url = book_element.css(".front-booklist-image-rating-container a").attribute("href").value
            Book.new(title, author, url)
                end
    end

    def self.scrape_book(book)
        html = open(USA_TODAY_URL+book.url)
        doc = Nokogiri::HTML(html)
        description = doc.search(".asset-double-wide.double-wide.NonReviewedBook p").map {|p| p.text} 
        description[9]
        # genre = doc.search(".books-stories-meta-genre p").each {|p|
        #     p.remove if p.name == 'span'}
        #     genre
        # binding.pry
    end




     
      
   

end

# title - .css(".books-stories-meta-title").text
#by_author - .css(".books-stories-meta-author").text.strip


