class Book
    attr_accessor :title, :author, :url, :this_weeks_ranking, :description, :genre, :weeks_listed

    @@all = []
    
    def initialize(title, url)
        @title = title
        @author = author
        @url = url
       
        @@all << self
    end

    def self.all
        @@all
    end
 
   
end