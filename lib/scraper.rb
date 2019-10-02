require 'nokogiri'
require 'open-uri'
require 'pry'

class Scraper


doc = Nokogiri::HTML(open("https://www.barnesandnoble.com/b/new-releases/_/N-1oyg"))
doc.css("div.sidebar__section refinements")
binding.pry

end

#genres - .css("div.refinements").text
#url - .css("a.bread-crumbs__item").attribute("href").value