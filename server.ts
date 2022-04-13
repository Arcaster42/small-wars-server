import express from 'express'
import { Application, NextFunction, Request, Response } from "express"

var indexRouter = require('./routes/index')
var usersRouter = require('./routes/users')

const app: Application = express()
const PORT: string | undefined = process.env.PORT || '3005'

app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.use('/', indexRouter)
app.use('/users', usersRouter)

// error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.sendStatus(500)
})

app.listen(PORT, () => { console.log(`Listening on ${PORT}`) })