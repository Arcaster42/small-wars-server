import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import { Application, NextFunction, Request, Response } from "express"
import { Client, clientList, matchmaker } from './server/socket'

var indexRouter = require('./routes/index')
var usersRouter = require('./routes/users')

const app: Application = express()
const PORT: string | undefined = process.env.PORT || '3005'
const server: http.Server = http.createServer(app)
const io = new Server(server, { cors: {
  origin: '*'
} })

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cors())

app.use('/', indexRouter)
app.use('/users', usersRouter)

// socket server
io.on('connection', (socket) => {
  console.log('Client Connected')

  socket.on('login', (data: { username: string }) => {
    const newClient: Client = new Client(data.username, socket)
    clientList.addClient(newClient)
    socket.emit('login approved')
    clientList.listClients()

    socket.on('match search', (data: { username: string }) => {
      console.log('new match client')
      matchmaker.addClient(newClient)
    })
  })

})

// error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.sendStatus(500)
})

server.listen(Number(PORT), () => { console.log(`Listening on ${PORT}`) })