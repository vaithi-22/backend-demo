const express = require('express');
const ejs = require('ejs');
require('dotenv').config();
const mysql2 = require('mysql2/promise')

const app = express();
app.set('view engine', 'ejs');  // tell Express that we are using EJS as our template engine
app.use(express.static('public'));

// handle forms via POST
app.use(express.urlencoded({
  extended: true
}))

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
};

// create a new connection pool
const dbConnection = mysql2.createPool(dbConfig);

app.get('/', async function (req, res) {

  const [tags] = await dbConnection.execute("SELECT * FROM tags");

  // query builder pattern
  const sql = `SELECT food_entries.id, dateTime, foodName, calories, meals.name AS 'meal', GROUP_CONCAT(tags.name) AS 'selectedTags' 
                FROM food_entries 
                LEFT JOIN meals ON food_entries.meal_id = meals.id
                LEFT JOIN food_entries_tags
                     ON food_entries.id = food_entries_tags.food_entry_id
                LEFT JOIN tags
                     ON tags.id = food_entries_tags.tag_id
                WHERE 1 %extraWhere%
                GROUP BY food_entries.id, dateTime, foodName, calories, meal`;

  let extraWhere = "";
  const bindings = [];

  // check if the user is searching by food name
  if (req.query.foodName) {
    console.log("user is searching for foodname with", req.query.foodName);
    extraWhere += " AND foodName LIKE ?";
    bindings.push("%" + req.query.foodName + "%");
  }

  if (req.query.date) {
    let operator = "=";
    if (req.query.date_operator == "after") {
      operator = ">"
    } else if (req.query.date_operator == "before") {
      operator = "<"
    }
    extraWhere += ` AND DATE(dateTime) ${operator} ?`;
    bindings.push(req.query.date)
  }

  if (req.query.tags) {
    
    const tags = Array.isArray(req.query.tags) ? req.query.tags : [ req.query.tags ];
    extraWhere += ` AND tags.id in (?)`;

    const tagIdToSearchFor = tags.map(tagId => parseInt(tagId));
    const tagCommaDelimitedString = tagIdToSearchFor.join(",")
    bindings.push(tagCommaDelimitedString)
  }

  
  const finalSql = sql.replace("%extraWhere%", extraWhere);
  console.log(finalSql, bindings);
  const [rows] = await dbConnection.execute(finalSql,  bindings);


  res.render("index", {
    "foodEntries": rows,
    "tags": tags,
    "searchParams": req.query ? {...req.query,
      'tags': Array.isArray(req.query.tags) ? req.query.tags : [ req.query.tags ]
    } : {
      tags:[]
    }
  })
});



app.get('/food-entry/create', async function (req, res) {
  const [meals] = await dbConnection.execute("SELECT * FROM meals");
  const [tags] = await dbConnection.execute("SELECT * FROM tags");
  res.render('create-food-entry', {
    meals,
    tags
  });
})

app.post('/food-entry/create', async function (req, res) {


  const connection = await dbConnection.getConnection();
  try {
    await connection.beginTransaction();

    // create a prepared query, aka parameterized query
    const sql = `INSERT INTO food_entries (dateTime, foodName, calories, meal_id, servingSize, unit)
            VALUES (?, ?, ?, ?, ?, ?);`
    const bindings = [req.body.dateTime, req.body.foodName, req.body.calories,
    req.body.meal_id, req.body.servingSize, req.body.unit];

    // create the new food entry
    const [results] = await connection.execute(sql, bindings);
    const newFoodEntryID = results.insertId;

    for (let tag of req.body.tags) {
      const sql = "INSERT INTO food_entries_tags (food_entry_id, tag_id) VALUES (?, ?)";
      await connection.execute(sql, [newFoodEntryID, tag])
    }

    res.redirect('/');

    await connection.commit(); // make all changes done to the database permanent
  } catch (e) {
    await connection.rollback();
  } finally {
    connection.release(); // release the connection so that it goes back to the pool
  }
})

app.get('/food-entry/:foodId/delete/', async function (req, res) {
  const foodId = req.params.foodId;
  // dbConnection.execute with SELECT * will always return an array of rows
  // even if there is one result. Then in this case, the row we want is in index 0
  const [rows] = await dbConnection.execute("SELECT * FROM food_entries WHERE id = ?", [foodId]);
  const foodEntry = rows[0];
  res.render('delete-food-entry', {
    foodEntry
  })
});

app.post("/food-entry/:foodId/delete/", async function (req, res) {
  const sql = "DELETE FROM food_entries WHERE id = ?";
  const foodId = req.params.foodId;
  await dbConnection.execute(sql, [foodId]);
  res.redirect('/');
})

app.get('/food-entry/:foodId/edit', async function (req, res) {
  const foodId = req.params.foodId;

  const [rows] = await dbConnection.execute(
    "SELECT * FROM food_entries WHERE id = ?",
    [foodId]
  );

  const foodEntry = rows[0];

  const [tags] = await dbConnection.execute("SELECT * FROM tags");
  const [meals] = await dbConnection.execute("SELECT * FROM meals");
  const [foodEntryTags] = await dbConnection.execute("SELECT * FROM food_entries_tags WHERE food_entry_id = ?", [foodId])
  const relatedTags = foodEntryTags.map(function (tagEntry) {
    return tagEntry.tag_id;
  })

  res.render('edit-food-entry', {
    foodEntry, meals, tags, relatedTags
  })
})

app.post('/food-entry/:foodId/edit', async function (req, res) {


  const connection = await dbConnection.getConnection();
  try {
    await connection.beginTransaction();
    const sql = `UPDATE food_entries SET dateTime = ?,
                        foodName=?,
                        calories= ?,
                        meal_id=?,
                        servingSize= ?,
                        unit=?
                    WHERE id=?`

    const bindings = [
      req.body.dateTime,
      req.body.foodName,
      req.body.calories,
      req.body.meal_id,
      req.body.servingSize,
      req.body.unit,
      req.params.foodId
    ];

    await connection.execute(sql, bindings);

    // delete all the existing tags for this food entries
    await connection.execute("DELETE FROM food_entries_tags WHERE food_entry_id = ?", [req.params.foodId]);

    // re-add all the tags from the form
    for (let tag of req.body.tags) {
      const sql = "INSERT INTO food_entries_tags (food_entry_id, tag_id) VALUES (?, ?)";
      await connection.execute(sql, [req.params.foodId, tag])
    }

    res.redirect('/');
    await connection.commit();
  } catch (e) {
    await connection.rollback();
  } finally {
    connection.release();
  }

})


app.listen(5000, function () {
  console.log("Server started")
})