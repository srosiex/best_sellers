

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
        if !input.to_i.between?(1, Book.all.length)
            puts "Book not found. Please select a different book."
            menu
        else
            book = Book.all[input.to_i-1]
            Scraper.scrape_book(book)
            display_book(book)
            see_more(book)
            menu
        end
    end

        def display_book(book)
            puts "--------------------------------------------"
            
            puts "Details on the book"
            puts "#{book.title} #{book.author}"
            puts "Genre: #{book.genre}"
            puts "Rating this week: ##{book.this_weeks_ranking}"
            puts "Number of weeks listed: #{book.weeks_listed}"
            puts "Description: #{book.description}"
            
            puts "--------------------------------------------"
        end

        def see_more(book)
            puts "Would you like to look at another book? - y/n "
            input = gets.strip.downcase
            if input == "y"
                puts "--------------------------------------------"
                Book.all.each.with_index(1) do |book, i|
                    puts "#{i}. #{book.title}"
                end
            elsif input == "n"
                puts "--------------------------------------------"
                puts "Thank you! Goodbye!"
                exit
            else 
                input != "y" && "n"
                puts "I don't understand. Please select a book."
                puts "--------------------------------------------"
                Book.all.each.with_index(1) do |book, i|
                    puts "#{i}. #{book.title}"
                end
            
                             
            end
        
        end

end
 



