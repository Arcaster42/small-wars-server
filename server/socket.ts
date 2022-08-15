import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"

export class Client {
  public username: string
  public socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>

  constructor (username: string, socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) {
    this.username = username
    this.socket = socket
  }
}

class ClientList {
  private clients: Client[] = []

  public addClient (client: Client): void {
    this.clients.push(client)
  }

  public listClients (): void {
    for (const client of this.clients) console.log(client.username)
  }

  public getClientByName (username: string): Client {
    return this.clients.filter(x => x.username === username)[0]
  }
}

class Matchmaker {
  private clients: Client[] = []

  public addClient (client: Client): void {
    this.clients.push(client)
    this.matchClients()
  }

  public removeClientByUsername (name: string): void {
    this.clients = this.clients.filter(x => x.username !== name)
  }

  private matchClients (): void {
    if (this.clients.length % 2 !== 0) return
    const client1: Client = this.clients[0]
    const client2: Client = this.clients[1]
    this.clients = this.clients.filter(x => x.username !== client1.username && x.username !== client2.username)
    const newGame: Game = new Game(client1, client2)
    gameList.addGame(newGame)
    client1.socket.emit('match found')
    client2.socket.emit('match found')
  }
}

class Player {
  username: string
  town: Town = new Town()

  constructor (username: string) {
    this.username = username
  }
}

class Game {
  public id: number
  private players: Player[]
  private cycleTime: number = 100

  constructor (client1: Client, client2: Client) {
    const player1: Player = new Player(client1.username)
    const player2: Player = new Player(client2.username)
    this.players = [player1, player2]
    this.id = gameList.getId()
    this.assignListeners()
    this.cycle()
  }

  private assignListeners (): void {
    for (const player of this.players) {
      const client: Client = clientList.getClientByName(player.username)
      if (!client) console.error('Client missing')
      client.socket.on('build', (data: { buildingName: BuildingName, pos: { x: number, y: number } }) => {
        const plan: BuildingPlan | undefined = buildingPlans.filter(x => x.name === data.buildingName)[0]
        if (!plan) console.error('Building plan missing')
        if (player.town.canBuild(plan, data.pos)) {
          player.town.build(plan, data.pos)
        }
      })
    }
  }

  private cycle (): void {
    setInterval(() => {
      for (const player of this.players) {
        for (const building of player.town.getBuildings()) building.cycleUp(player.town, this.cycleTime)
        clientList.getClientByName(player.username).socket.emit('update game', player.town)
      }
    }, this.cycleTime)
  }
}

class GameList {
  private games: Game[] = []

  public getId (): number {
    return Math.max(...this.games.map(x => x.id)) + 1
  }

  public addGame (game: Game): void {
    this.games.push(game)
  }

  public removeGameById (id: number): void {
    this.games = this.games.filter(x => x.id !== id)
  }  
}

class Town {
  private resources: { [key in Resource]: number } = {
    // Primary Resources
    res_food: 10,
    res_lumber: 10,
    res_stone: 5,
    res_weapons: 0,
    res_coins: 2,
    // Secondary Resources
    res_wheat: 0,
    res_wood: 0,
    res_meat: 0,
    res_iron: 0,
    res_gold: 0,
    // Population
    pop_settlers: 5,
    // pop_footmen: 0,
    // pop_archers: 0,
    // pop_cavalry: 0,
    // pop_cannons: 0
  }
  // Buildings
  private buildings: Building[] = []
  // Grid
  private grid: (Building | 'empty')[][]
  // Controls
  private blueprints: BuildingPlan[] = [...buildingPlans]

  constructor () {
    const rows: number = 4
    const cols: number = 4
    const grid: (Building | 'empty')[][] = Array.from({ length: cols }).map(x => Array.from({ length: rows }, () => 'empty'))
    this.grid = grid
    this.init()
  }

  private init () {
    const townCenter: Building = new Building(1, { x: 0, y: 0 }, 'town_center')
    this.buildings.push(townCenter)
    this.grid[0][0] = townCenter
  }

  public getBuildings (buildingName?: BuildingName): Building[] {
    return buildingName ? this.buildings.filter(x => x.name === buildingName) : this.buildings
  }

  public getBuildingPlans (): BuildingPlan[] {
    return this.blueprints
  }

  public getNextId (): number {
    return Math.max(...this.buildings.map(x => x.id)) + 1
  }

  public canBuild (buildingPlan: BuildingPlan, pos: { x: number, y: number }): boolean {
    if (this.grid[pos.y][pos.x] !== 'empty') return false
    for (const key of Object.keys(buildingPlan.cost) as Resource[]) {
      if (this.resources[key] < buildingPlan.cost[key]!) return false
    }
    return true
  }

  public build (buildingPlan: BuildingPlan, pos: { x: number, y: number }): void {
    const building: Building = new Building(this.getNextId(), pos, buildingPlan.name)
    for (const [name, cost] of Object.entries(buildingPlan.cost) as [Resource, number][]) {
      this.resources[name] -= cost
    }
    this.buildings.push(building)
    this.grid[pos.y][pos.x] = building
  }

  public getResource (key: Resource): number {
    return this.resources[key]
  }

  public addResource (key: Resource, val: number): void {
    this.resources[key] += val
    this.capResources()
  }

  public subResource (key: Resource, val: number): void {
    this.resources[key] -= val
  }

  private capResources (): void {
    const settlersCap: number = (this.countBuilding('house') * 4) + (this.countBuilding('town_center') * 10)
    if (this.resources.pop_settlers > settlersCap) this.resources.pop_settlers = settlersCap
    const foodCap: number = (this.countBuilding('town_center') * 10) + (this.countBuilding('bakery') * 2) + (this.countBuilding('butcher') * 4)
    if (this.resources.res_food > foodCap) this.resources.res_food = foodCap
    const wheatCap: number = this.countBuilding('farm') * 4
    if (this.resources.res_wheat > wheatCap) this.resources.res_wheat = wheatCap
    const lumberCap: number = (this.countBuilding('town_center') * 10) + (this.countBuilding('lumber_yard') * 4)
    if (this.resources.res_lumber > lumberCap) this.resources.res_lumber = lumberCap
  }

  public countBuilding (building: BuildingName): number {
    return this.buildings.filter(x => x.name === building).length
  }
}

interface BuildingPlan {
  name: BuildingName
  hitpoints: number
  defense: number
  efficiency: number
  cost: CostPlan
  buildTime: number
  cycleAction?: (town: Town) => void
}

type BuildingName = 'town_center' | 'house' | 'farm' | 'hunting_lodge' | 'woodcutter' | 'lumber_yard' | 'quarry' | 'iron_mine' | 'gold_mine' | 'bakery' | 'butcher' | 'barracks'

class Building {
  public id: number
  public pos: { x: number, y: number }
  public name: BuildingName
  private defense: number
  private efficiency: number
  private cost: CostPlan
  private buildTime: number
  private cycleCounter: number = 0
  private cycleThreshold: number = 5000
  private cycleAction?: (town: Town) => void

  constructor (id: number, pos: { x: number, y: number }, name: BuildingName) {
    this.id = id
    this.pos = pos
    this.name = name
    const buildingPlan: BuildingPlan = buildingPlans.filter(x => x.name === name)[0]
    this.defense = buildingPlan.defense
    this.efficiency = buildingPlan.efficiency
    this.cost = buildingPlan.cost
    this.buildTime = buildingPlan.buildTime
    this.cycleAction = buildingPlan.cycleAction
  }

  cycleUp (town: Town, val: number): void {
    this.cycleCounter += val
    if (this.cycleCounter >= this.cycleThreshold) {
      if (this.cycleAction) this.cycleAction(town)
      this.cycleCounter = 0
    }
  }
}

type CostPlan = { [key in Resource]?: number }

type Resource = 'res_food' | 'res_wheat' | 'res_wood' | 'res_meat' | 'res_weapons' | 'res_coins' | 'res_lumber' | 'res_stone' | 'pop_settlers' | 'res_iron' | 'res_gold'

const townCenter: BuildingPlan = {
  name: 'town_center',
  hitpoints: 100,
  defense: 0.05,
  efficiency: 1.00,
  cost: {
    res_lumber: 20,
    res_stone: 10,
    pop_settlers: 10
  },
  buildTime: 60000,
  cycleAction: (town: Town) => {
    town.addResource('pop_settlers', 1)
    town.addResource('res_food', 0.1)
    town.addResource('res_lumber', 0.1)
  }
}

const house: BuildingPlan = {
  name: 'house',
  hitpoints: 5,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 2,
    res_stone: 1
  },
  buildTime: 5000,
  cycleAction: (town: Town) => { 
    town.addResource('pop_settlers', 2)
   }
}

const farm: BuildingPlan = {
  name: 'farm',
  hitpoints: 2,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 2,
    pop_settlers: 2
  },
  buildTime: 5000,
  cycleAction: (town: Town) => {
    town.addResource('res_wheat', 1)
  }
}

const huntingLodge: BuildingPlan = {
  name: 'hunting_lodge',
  hitpoints: 5,
  defense: 0.05,
  efficiency: 1.00,
  cost: {
    res_lumber: 4,
    pop_settlers: 3
  },
  buildTime: 10000,
  cycleAction: (town: Town) => {
    town.addResource('res_meat', 1)
  }
}

const woodcutter: BuildingPlan = {
  name: 'woodcutter',
  hitpoints: 10,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 2,
    pop_settlers: 2
  },
  buildTime: 10000,
  cycleAction: (town: Town) => {
    town.addResource('res_wood', 1)
  }
}

const lumberYard: BuildingPlan = {
  name: 'lumber_yard',
  hitpoints: 10,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 3,
    pop_settlers: 4
  },
  buildTime: 10000,
  cycleAction: (town: Town) => {
    if (town.getResource('res_wood') >= 2) {
      town.subResource('res_wood', 2)
      town.addResource('res_lumber', 1)
    }
  }
}

const quarry: BuildingPlan = {
  name: 'quarry',
  hitpoints: 10,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 3,
    pop_settlers: 4
  },
  buildTime: 10000,
  cycleAction: (town: Town) => {
    town.addResource('res_stone', 1)
  }
}

const ironMine: BuildingPlan = {
  name: 'iron_mine',
  hitpoints: 10,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 3,
    res_stone: 1,
    pop_settlers: 5
  },
  buildTime: 15000,
  cycleAction: (town: Town) => {
    town.addResource('res_iron', 1)
  }
}

const goldMine: BuildingPlan = {
  name: 'gold_mine',
  hitpoints: 10,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 3,
    res_stone: 1,
    pop_settlers: 5
  },
  buildTime: 15000,
  cycleAction: (town: Town) => {
    town.addResource('res_gold', 1)
  }
}

const bakery: BuildingPlan = {
  name: 'bakery',
  hitpoints: 8,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 3,
    res_stone: 1,
    pop_settlers: 2
  },
  buildTime: 15000,
  cycleAction: (town: Town) => {
    if (town.getResource('res_wheat') >= 2) {
      town.subResource('res_wheat', 2)
      town.addResource('res_food', 1)
    }
  }
}

const butcher: BuildingPlan = {
  name: 'butcher',
  hitpoints: 8,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 4,
    res_stone: 2,
    pop_settlers: 2
  },
  buildTime: 15000,
  cycleAction: (town: Town) => {
    if (town.getResource('res_meat') >= 2) {
      town.subResource('res_meat', 2)
      town.addResource('res_food', 1.5)
    }
  }
}

const barracks: BuildingPlan = {
  name: 'barracks',
  hitpoints: 20,
  defense: 0.00,
  efficiency: 1.00,
  cost: {
    res_lumber: 5,
    res_stone: 4,
    pop_settlers: 5
  },
  buildTime: 20000
}

const buildingPlans: BuildingPlan[] = [
  townCenter, house, farm, woodcutter, huntingLodge, lumberYard, quarry, ironMine, goldMine, bakery, butcher,
  barracks
]

export const clientList = new ClientList()
export const matchmaker = new Matchmaker()
export const gameList = new GameList()