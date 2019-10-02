require 'nokogiri'
require 'open-uri'
require 'pry'

class Scraper

    def get_page
        Nokogiri::HTML(open("https://www.barnesandnoble.com/b/new-releases/_/N-1oyg"))
    end

    def scrape_genres
        self.get_page.css("div.refinements").text
    end
scrape_genres
binding.pry


end

#genres - .css("div.refinements").text
#url - .css("a.bread-crumbs__item").attribute("href").value