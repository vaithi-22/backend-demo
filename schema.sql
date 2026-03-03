CREATE DATABASE cico_tracker;
USE cico_tracker;

CREATE TABLE food_entries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dateTime DATETIME NOT NULL,
    foodName VARCHAR(255) NOT NULL,
    calories INT NOT NULL,
    meal VARCHAR(50) NOT NULL,
    tags JSON,
    servingSize INT NOT NULL,
    unit VARCHAR(50) NOT NULL
);


INSERT INTO food_entries 
(dateTime, foodName, calories, meal, tags, servingSize, unit) 
VALUES
('2026-03-02 12:45:00', 'Veggie Burger', 520, 'Lunch', '["vegetarian", "fast-food"]', 1, 'gram'),

('2026-03-02 15:30:00', 'Protein Shake', 180, 'Snack', '["protein", "drink", "post-workout"]', 1, 'gram'),

('2026-03-02 19:30:00', 'Grilled Salmon', 480, 'Dinner', '["protein", "omega-3", "low-carb"]', 1, 'gram'),

('2026-03-03 07:45:00', 'Pancakes with Syrup', 550, 'Breakfast', '["sweet", "high-carb"]', 3, 'gram');