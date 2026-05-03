using my.project as my from '../db/schema';

service catalogservice {
    @readonly 
    entity Products as projection on my.Products;
}
