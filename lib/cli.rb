

class CLI
    def run
        books = []
        puts "Welcome! Here are this week's best selling books!"
        puts "What book would you like to check out?"
        puts "--------------------------------------------"
         Scraper.scrape_usa

        Book.all.each.with_index(1) do |book, i|
            puts "#{i}. #{book.title}"
        end
        menu
    end

    def menu
        puts "Please select a book to find out more info."
        input = gets.chomp
        book = Book.all[input.to_i-1]

        if !book
            puts "Book not found. Please select a different book."
            menu
        else
            Scraper.scrape_book(book)
            
            puts "--------------------------------------------"
            
            puts "Details on the book"
            puts "#{book.title} #{book.author}"
            puts "Genre: #{book.genre}"
            puts "Rating this week: ##{book.this_weeks_ranking}"
            puts "Number of weeks listed: #{book.weeks_listed}"
            puts "Description: #{book.description}"
            
            puts "--------------------------------------------"
            
            puts "Would you like to look at another book? - y/n "
                input = gets.strip.downcase
                if input == "y"
                    puts "--------------------------------------------"
                    Scraper.scrape_usa
                    Book.all.each.with_index(1) do |book, i|
                        puts "#{i}. #{book.title}"
                    end
                elsif input == "n"
                    puts "--------------------------------------------"
                    puts "Thank you! Goodbye!"
                    exit
                else input != "y" || "n"
                    puts "I don't understand."
                    puts "--------------------------------------------"
                    run
                end
        
        
                             menu
        
        end
    end


end
 



