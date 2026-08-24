const assert = require("assert");

class RoomSim {
  constructor(names) {
    this.players = names.map((name, i) => ({id:`p${i+1}`, name, status:"JOINED"}));
    this.registrationOpen = true;
    this.round = null;
    this.nextRound = 1;
  }

  closeRegistration() {
    assert(this.registrationOpen);
    this.registrationOpen = false;
    this.round = {
      number:this.nextRound++,
      playerCount:this.players.length,
      status:"READY",
      objects:[
        {id:"o1", name:"Ball", number:1},
        {id:"o2", name:"Bell", number:2},
        {id:"o3", name:"Cup", number:3},
        {id:"o4", name:"Apple", number:4},
        {id:"o5", name:"Book", number:5},
      ],
      votes:[]
    };
  }

  start() {
    assert(this.round && this.round.status === "READY");
    this.round.status = "ACTIVE";
  }

  vote(playerId, objectId) {
    assert(this.round.status === "ACTIVE");
    assert(!this.round.votes.some(v => v.playerId === playerId), "duplicate vote");
    const player = this.players.find(p => p.id === playerId);
    assert(player, "unknown player");
    const obj = this.round.objects.find(o => o.id === objectId);
    assert(obj && obj.number !== null, "object unavailable");

    const number = obj.number;
    obj.number = null;
    this.round.votes.push({playerId, objectId, number});
    player.status = "VOTED";

    if (this.round.votes.length === this.round.playerCount) {
      this.round.status = "COMPLETED";
    }
    return number;
  }

  advanceToNextRound() {
    assert(this.round.status === "COMPLETED");
    this.round = null;
    this.registrationOpen = true;
    this.players.forEach(p => p.status = "JOINED");
  }
}

// Round 1: 3 players.
const room = new RoomSim(["Ahmad Real", "Player 2", "Player 3"]);
room.closeRegistration();
assert.strictEqual(room.round.playerCount, 3);
room.start();

assert.strictEqual(room.vote("p1", "o1"), 1);
assert.strictEqual(room.round.status, "ACTIVE");
assert.strictEqual(room.vote("p2", "o2"), 2);
assert.strictEqual(room.round.status, "ACTIVE");
assert.strictEqual(room.vote("p3", "o3"), 3);
assert.strictEqual(room.round.status, "COMPLETED");

// A completed round cannot continue.
assert.throws(() => room.vote("p1", "o4"));

// Round 2 can reopen registration and use a different player count.
room.advanceToNextRound();
room.players.push({id:"p4", name:"Player 4", status:"JOINED"});
room.closeRegistration();
assert.strictEqual(room.round.number, 2);
assert.strictEqual(room.round.playerCount, 4);
room.start();

for (const [pid, oid] of [["p1","o1"],["p2","o2"],["p3","o3"],["p4","o4"]]) {
  room.vote(pid, oid);
}
assert.strictEqual(room.round.status, "COMPLETED");

console.log("AJO integration simulation: PASS");