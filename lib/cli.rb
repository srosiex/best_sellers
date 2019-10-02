class CLI

    def call
        list_genres
        menu
        quit
    end

    def list_genres
        puts "Book Genres:"
        @genres = 
        @genres.each.with_index(1) do |genre, i|
            puts "#{i}. #{genre}"
    end

    def menu
    end

    def quit
    end
