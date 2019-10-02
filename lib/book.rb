class Book

    @@all = []
    attr_accessor :title, :author, :url

    def initialize(title, author, url)
        @title = title
        @author = author
        @url = url
        @@all << self
    end

    def self.all
        @@all
    end



end