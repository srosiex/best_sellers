

class CLI
    def run
        books = []
        puts "Welcome! Here are some best sellers!"
        puts "What book would you like to check out?"
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
        end
    end

end
 



#books info - 
#title - book_element.css(".books-front-meta-title").text



