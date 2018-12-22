/* GBS_Core.js */

/**
	@file The GoBattleSim simulator core.
	@author BIOWP
*/

const MAX_NUM_POKEMON_PER_PARTY = 6;
const MAX_NUM_PARTIES_PER_PLAYER = 5;
const MAX_NUM_OF_PLAYERS = 21;
const MAX_BATTLE_DURATION_MS = 3600000;

const EVENT_TYPE = {
	Free: 0,
	Announce: 1,
	Damage: 2,
	Hurt: 3,	// Deprecated
	EnergyDelta: 4,
	MoveEffect: 5,
	Dodge: 6,
	Protect: 7,
	Enter: 8,
	Switch: 9
};



/**
	The damage formula, calculating how much damage the attack inflicts.
	@param {Pokemon} dmgGiver The Pokemon using the attack.
	@param {Pokemon} dmgReceiver The Pokemon taking the hit.
	@param {Move} move The move being used.
	@param {string} weather The current weather.
	@return {number} The damage value.
*/
function damage(dmgGiver, dmgReceiver, move, weather){
	var stab = 1;	// Same Type Attack Bonus
	if (move.pokeType == dmgGiver.pokeType1 || move.pokeType == dmgGiver.pokeType2){
		stab = Data.BattleSettings.sameTypeAttackBonusMultiplier;
	}
	var wab = 1;	// Weather Attack Bonus
	if (Data.TypeEffectiveness[move.pokeType].boostedIn == weather){
		wab = Data.BattleSettings.weatherAttackBonusMultiplier;
	}
	var fab = dmgGiver.fab || 1;	// Friend Attack Bonus mutiplier
	var mab = dmgGiver[move.moveType + "AttackBonus"] || 1;	// Move Attack Bonus mutiplier (for PvP)
	var effe1 = Data.TypeEffectiveness[move.pokeType][dmgReceiver.pokeType1] || 1;
	var effe2 = Data.TypeEffectiveness[move.pokeType][dmgReceiver.pokeType2] || 1;
	return Math.floor(0.5*dmgGiver.Atk/dmgReceiver.Def*move.power*effe1*effe2*stab*wab*fab*mab) + 1;
}


/**
	The CP formula, calculating the current CP of a Pokemon.
	@param {Pokemon} pkm The Pokemon to calculate CP for. Expected to have Atk, Def and Stm. If not, then must have base stats, IV stats and cpm.
	@return {number} The CP value
*/
function calculateCP(pkm){
	var atk = pkm.Atk || (pkm.baseAtk + pkm.atkiv) * pkm.cpm;
	var def = pkm.Def || (pkm.baseDef + pkm.defiv) * pkm.cpm;
	var stm = pkm.Stm || (pkm.baseStm + pkm.stmiv) * pkm.cpm;
	return Math.max(10, Math.floor(atk * Math.sqrt(def * stm)/10));
}

/**
	Find a combination of {level, atkiv, defiv, stmiv} that yields the given CP for a Pokemon.
	@param {Pokemon} pkm The Pokemon to infer level and IVs for. Expected to have baseAtk, baseDef and baseStm.
	@param {number} cp The given CP.
	@return {Object} A set of {level, atkiv, defiv, stmiv} that yields the given CP. If no combination is found, return null.
*/
function inferLevelAndIVs(pkm, cp){
	var minIV = Data.IndividualValues[0].value, maxIV = Data.IndividualValues[Data.IndividualValues.length - 1].value;
	var pkm2 = {baseAtk: pkm.baseAtk, baseDef: pkm.baseDef, baseStm: pkm.baseStm};
	var minLevelIndex = null;
	pkm2.atkiv = pkm2.defiv = pkm2.stmiv = maxIV;
	for (var i = 0; i < Data.LevelSettings.length; i++){
		pkm2.cpm = Data.LevelSettings[i].cpm;
		if (calculateCP(pkm2) <= cp){
			minLevelIndex = i;
		}else{
			break;
		}
	}
	if (minLevelIndex == null)
		return null;
	for (var i = minLevelIndex; i < Data.LevelSettings.length; i++){
		pkm2.level = Data.LevelSettings[i].value;
		pkm2.cpm = Data.LevelSettings[i].cpm;
		for (pkm2.atkiv = minIV; pkm2.atkiv <= maxIV; pkm2.atkiv++){
			for (pkm2.defiv = minIV; pkm2.defiv <= maxIV; pkm2.defiv++){
				for (pkm2.stmiv = minIV; pkm2.stmiv <= maxIV; pkm2.stmiv++){
					if (calculateCP(pkm2) == cp){
						return pkm2;
					}
				}
			}
		}
	}
}



/** 
	@class
	@param {string|number|Move} m Information of the move.
	@param {Object[]} moveDatabase The database to look up for the move stats.
*/
function Move(m, moveDatabase){
	if (typeof m == typeof 0 && m >= 0){
		leftMerge(this, moveDatabase[m]);
	}else if (typeof m == typeof ""){
		leftMerge(this, getEntry(m.toLowerCase(), moveDatabase));
	}else{
		leftMerge(this, m);
	}
}



/** 
	@class
	@param {Object|Pokemon} cfg Keyword arguments for constructing the Pokemon.
*/
function Pokemon(cfg){
	this.id = cfg.id;
	this.role = (cfg.role || "a").split("_")[0];
	this.raidTier = cfg.raidTier;
	this.master = cfg.master || null;
	this.nickname = cfg.nickname || "";
	this.immortal = cfg.immortal || false;
	if (this.role.toUpperCase() == this.role){
		this.immortal = true;
		this.role = this.role.toLowerCase();
	}
	this.fab = cfg.fab || 1;
	
	let speciesData = {};
	if (typeof cfg.index == typeof 0 && cfg.index >= 0){
		speciesData = Data.Pokemon[cfg.index];
	}else if (typeof cfg.name == typeof ""){
		speciesData = getEntry(cfg.name.toLowerCase(), Data.Pokemon);
	}else{
		speciesData = cfg;
	}
	this.name = speciesData.name;
	this.pokeType1 = speciesData.pokeType1;
	this.pokeType2 = speciesData.pokeType2;
	this.baseAtk = speciesData.baseAtk;
	this.baseDef = speciesData.baseDef;
	this.baseStm = speciesData.baseStm;
	if (cfg.role && cfg.role.includes("_basic")){
		let inferred = inferLevelAndIVs(this, parseInt(cfg.cp));
		if (inferred == null){
			throw Error('No combination of level and IVs are found for ' + this.name);
		}
		cfg.atkiv = this.atkiv = inferred.atkiv;
		cfg.defiv = this.defiv = inferred.defiv;
		cfg.stmiv = this.stmiv = inferred.stmiv;
		cfg.level = this.level = inferred.level;
		this.cpm = inferred.cpm;
	}else{
		this.atkiv = parseInt(cfg.atkiv);
		this.defiv = parseInt(cfg.defiv);
		this.stmiv = parseInt(cfg.stmiv);
		this.level = cfg.level;
		this.cpm = parseFloat(cfg.cpm);
		if (isNaN(this.cpm) && this.level != undefined){
			let levelSetting = getEntry(this.level.toString(), Data.LevelSettings, true);
			if (levelSetting){
				this.cpm = levelSetting.cpm;
			}
		}
	}
	this.fmove = new Move(cfg.fmove, Data.FastMoves);
	this.cmove = new Move(cfg.cmove, Data.ChargedMoves);
	this.cmoves = [];
	if (cfg.cmoves){
		let unique_cmoves = cfg.cmoves.filter(function(item, pos){
			return cfg.cmoves.indexOf(item) == pos;
		});
		for (let cmove of unique_cmoves){
			this.cmoves.push(new Move(cmove, Data.ChargedMoves));
		}
	}else{
		this.cmoves.push(this.cmove);
	}
	if (cfg.cmove2){
		this.cmoves.push(new Move(cfg.cmove2, Data.ChargedMoves));
	}
	this.choose = cfg.choose || window[cfg.strategy] || strat1;
	this.protectStrategy = new ProtectShieldStrategy(cfg.strategy2);
	this.init();
}

/** 
	Initialize the Pokemon's battle states. Call this method before a new battle.
*/
Pokemon.prototype.init = function(){
	this.calculateStats();
	
	// Battle state variables
	this.active = false;
	this.damageReductionExpiration = -1;
	this.damageReductionPercent = 0;
	this.queuedAction = null;
	this.projectedRivalActions = new Timeline();
	this.protectStrategy.init();
	this.fastAttackBonus = 1;
	this.chargedAttackBonus = 1;
	this.actionCount = 0;
	this.statEffectivenessLevel = 0;
	
	// Performance metrics. Does not affect battle outcome
	this.timeEnterMs = 0;
	this.activeDurationMs = 0;
	this.numOfDeaths = 0;
	this.tdo = 0;
	this.tdoFast = 0;
	this.numOfFastHits = 0;
	this.numOfChargedHits = 0;
	this.numOfFastHitsPostCharged = 0;
	
	this.calculateStats();
	this.heal();
}

/** 
	Re-calculate and set the core stats of the Pokemon.
*/
Pokemon.prototype.calculateStats = function(){
	if (this.role == "gd"){ // gym defender
		this.Atk = (this.baseAtk + this.atkiv) * this.cpm;
		this.Def = (this.baseDef + this.defiv) * this.cpm;
		this.Stm = (this.baseStm + this.stmiv) * this.cpm;
		this.maxHP = 2 * Math.floor(this.Stm);
	}else if (this.role == "rb") { // raid boss
		let raidTierSetting = getEntry(this.raidTier.toString(), Data.RaidTierSettings, true);
		this.cpm = raidTierSetting.cpm;
		this.Atk = (this.baseAtk + 15) * this.cpm;
		this.Def = (this.baseDef + 15) * this.cpm;
		this.maxHP = raidTierSetting.HP;
	}else{ // default, attacker
		this.role = "a";
		this.Atk = (this.baseAtk + this.atkiv) * this.cpm;
		this.Def = (this.baseDef + this.defiv) * this.cpm;
		this.Stm = (this.baseStm + this.stmiv) * this.cpm;
		this.maxHP = Math.floor(this.Stm);
	}
	/*
	this.Atk *= (1 + this.statEffectivenessLevel * 0.05);
	this.Def *= (1 + this.statEffectivenessLevel * 0.05);
	*/
}

/**
	Check whether the Pokemon is alive (is able to stay in battle).
	@return {boolean} True if its HP > 0 or it's immortal and false otherwise.
*/
Pokemon.prototype.isAlive = function(){
	return this.HP > 0 || this.immortal;
}

/** 
	Fully heal the Pokemon and set its energy to 0
*/
Pokemon.prototype.heal = function(){
	this.HP = this.maxHP;
	this.energy = 0;
}

/** 
	The Pokemon gains/loses energy.
	@param {number} energyDelta The amount of energy change. Positive value indicates energy gain.
*/
Pokemon.prototype.gainEnergy = function(energyDelta){
	this.energy += energyDelta;
	if (this.energy > Data.BattleSettings.maximumEnergy){
		this.totalEnergyOvercharged += this.energy - Data.BattleSettings.maximumEnergy;
		this.energy = Data.BattleSettings.maximumEnergy;
	}
}

/** 
	The Pokemon takes damage and changes HP.
	@param {number} dmg The amount of HP to lose.
*/
Pokemon.prototype.takeDamage = function(dmg){
	this.HP -= dmg;
	if (!this.isAlive()){
		this.numOfDeaths++;
	}
}

/** 
	Buff or debuff the Pokemon's core stats.
	@param {number=} deltaLevel The change of the stat effectiveness level. If omitted, the level will be reset to 0.
*/
Pokemon.prototype.changeStatEffectivenessLevel = function(deltaLevel){
	if (deltaLevel === undefined){
		this.statEffectivenessLevel = 0;
	}else{
		this.statEffectivenessLevel += deltaLevel;
	}
	this.calculateStats();
}


/** 
	Decides which charged move to use based on an opponent.
	@enemy {Pokemon} The opponent based on which to select charged move.
	@weather {string} The current weather.
*/
Pokemon.prototype.adjustDefaultChargedMove = function(enemy, weather){
	var best_cmove = this.cmoves[0];
	var best_dpe = damage(this, enemy, best_cmove, weather) / (-best_cmove.energyDelta);
	for (let cmove of this.cmoves){
		let dpe = damage(this, enemy, cmove, weather) / (-cmove.energyDelta);
		if (dpe > best_dpe){
			best_cmove = cmove;
			best_dpe = dpe;
		}
	}
	this.cmove = best_cmove;
}

/** 
	Increase the Pokemon's TDO to keep track of its battle performance.
	@param {number} dmg The amount of damage attributed to the Pokemon.
	@param {string} moveType The type of the move.
*/
Pokemon.prototype.attributeDamage = function(dmg, moveType){
	this.tdo += dmg;
	if (moveType == 'fast'){
		this.tdoFast += dmg;
	}
}

/** 
	Increase the corresponding attack count by 1.
	@moveType {string} The type of the move.
*/
Pokemon.prototype.incrementAttackCount = function(moveType){
	if (moveType == 'fast'){
		this.numOfFastHits++;
		this.numOfFastHitsPostCharged++;
	}else{
		this.numOfFastHitsPostCharged = 0;
		this.numOfChargedHits++;
	}
}

/** 
	Get the battle performance metrics of the Pokemon.
	@return {Object} Battle performance metrics.
*/
Pokemon.prototype.getStatistics = function(){
	return {
		name: this.name,
		nickname: this.nickname,
		hp: this.HP,
		energy: this.energy,
		tdo: this.tdo,
		tdoFast: this.tdoFast,
		duration: this.activeDurationMs/1000,
		dps: this.tdo / (this.activeDurationMs/1000),
		numOfFastHits: this.numOfFastHits,
		numOfChargedHits: this.numOfChargedHits,
		numOfFastHitsPostCharged: this.numOfFastHitsPostCharged
	};
}
/* End of Class <Pokemon> */



/** 
	@class
	@param {Object|Party} cfg Keyword arguments for constructing the party.
*/
function Party(cfg){
	this.revive = cfg.revive;
	this.fab = cfg.fab || 1;
	this.pokemon = [];
	for (let pokemon of cfg.pokemon){
		pokemon.fab = this.fab;
		for (var r = 0; r < (pokemon.copies || 1); r++){
			this.pokemon.push(new Pokemon(pokemon));
		}
	}
	this.headingPokemonIndex = 0;
	this.heal();
}

/** 
	Initialize the party. Call this method before a new battle.
*/
Party.prototype.init = function(){
	for (let pokemon of this.pokemon){
		pokemon.init();
		pokemon.originParty = this;
	}
	this.headingPokemonIndex = 0;
}

/** 
	Get the heading Pokemon of the party.
	@return {Pokemon} The heading Pokemon.
*/
Party.prototype.head = function(){
	return this.pokemon[this.headingPokemonIndex];
}

/**
	Set heading Pokemon to the next alive Pokemon in the party.
	@return {boolean} true if there is such Pokemon in the party and false otherwise.
*/
Party.prototype.selectNextPokemon = function(){
	for (var i = this.headingPokemonIndex + 1; i < this.pokemon.length; i++){
		if (this.pokemon[i].isAlive()){
			this.headingPokemonIndex = i;
			return true;
		}
	}
	return false;
}

/**
	Set heading Pokemon to the first alive Pokemon in the party.
	@return {boolean} true if there is such Pokemon in the party and false otherwise.
*/
Party.prototype.selectFirstPokemon = function(){
	for (var i = 0; i < this.pokemon.length; i++){
		if (this.pokemon[i].isAlive()){
			this.headingPokemonIndex = i;
			return true;
		}
	}
	return false;
}

/**
	Switch the heading Pokemon to another Pokemon in the party.
	@param {number} index The index of the Pokemon to switch to.
	@return {boolean} true if the switching is successful and false otherwise.
*/
Party.prototype.switchPokemon = function(index){
	if (0 <= index && index < this.pokemon.length){
		if (this.pokemon[index].isAlive()){ // Cannot switch to a fainted Pokemon
			this.headingPokemonIndex = index;
			return true;
		}
	}
	return false;
}

/** 
	Fully heal all Pokemon of the party and set the heading pokemon to the first one.
*/
Party.prototype.heal = function (){
	for (let pokemon of this.pokemon){
		pokemon.heal();
	}
	this.headingPokemonIndex = 0;
}

/** 
	Get the battle performance metrics of the party.
	@return {Object} Battle performance metrics.
*/
Party.prototype.getStatistics = function(){
	let sum_tdo = 0, sum_numOfDeaths = 0;
	for (let pokemon of this.pokemon){
		sum_tdo += pokemon.tdo;
		sum_numOfDeaths += pokemon.numOfDeaths;
	}
	return {
		tdo: sum_tdo,
		numOfDeaths: sum_numOfDeaths
	};
}




/**
	@class
	@param {Object|Player} cfg Keyword arguments for constructing the player.
*/
function Player(cfg){
	this.index = cfg.index;
	this.fab = cfg.fab || getFriendMultiplier(cfg.friend);
	this.team = cfg.team;
	this.rivals = [];
	this.parties = [];
	for (let party of cfg.parties){
		party.fab = this.fab;
		this.parties.push(new Party(party));
	}
	for (let party of this.parties){
		for (pokemon of party.pokemon){
			pokemon.master = this;
		}
	}
	this.headingPartyIndex = 0;
}

/** 
	Initialize the player. Call this method before a new battle.
*/
Player.prototype.init = function(){
	for (let party of this.parties){
		party.init();
	}
	this.headingPartyIndex = 0;
	this.protectShieldLeft = 2;
	this.switchingCooldownExpiration = -1;
}

/** 
	Get the heading Pokemon of the player.
	@return {Pokemon} The heading Pokemon.
*/
Player.prototype.head = function(){
	let party = this.headParty();
	return party ? party.head() : null;
}

/** 
	Get the heading party of the player.
	@return {Party} The heading party.
*/
Player.prototype.headParty = function(){
	return this.parties[this.headingPartyIndex];
}

/**
	Select the next alive Pokemon of the active party of the player.
	@return {boolean} true if the heading party has next alive Pokemon and false otherwise
*/
Player.prototype.selectNextPokemon = function(){
	let party = this.headParty();
	if (party){
		if (party.selectNextPokemon()) // Try next Pokemon and see if it's alive
			return true;
		return party.selectFirstPokemon(); // Otherwise try to find the first Pokemon in the party
	}else{
		return false;
	}
}

/**
	Select the best Pokemon from the active party to counter the opponent.
	@return {boolean} true if the heading party has at least one alive Pokemon and false otherwise.
*/
Player.prototype.selectBestPokemon = function(){
	var party = this.headParty();
	var enemy = null;
	for (let rival of this.rivals){
		enemy = rival.head();
		if (enemy)
			break;
	}
	if (enemy == null || party == null)
		return false;
	
	var best_pkm_index = -1;
	var best_cycle_dps = 0;
	for (var i = 0; i < party.pokemon.length; i++){
		let pkm = party.pokemon[i];
		if (pkm.isAlive()){
			pkm.adjustDefaultChargedMove(enemy);
			let fDPS = damage(pkm, enemy, pkm.fmove) / pkm.fmove.duration;
			let fEPS = pkm.fmove.energyDelta / pkm.fmove.duration;
			let cDPE = damage(pkm, enemy, pkm.cmove) / (-pkm.cmove.energyDelta);
			let cycle_dps = fDPS + fEPS * cDPE;
			if (cycle_dps > best_cycle_dps){
				best_pkm_index = i;
				best_cycle_dps = cycle_dps;
			}
		}
	}
	if (best_pkm_index >= 0){
		party.headingPokemonIndex = best_pkm_index;
		return true;
	}
	return false;
}

/**
	Select the next available party.
	@return true if there is next party and false otherwise
*/
Player.prototype.selectNextParty = function(){
	return ++this.headingPartyIndex < this.parties.length;
}

/** 
	Get the battle performance metrics of the player.
	@return {Object} Battle performance metrics.
*/
Player.prototype.getStatistics = function(battleDuration){
	let sum_tdo = 0, sum_numOfDeaths = 0;
	for (let party of this.parties){
		let party_stat = party.getStatistics();
		sum_tdo += party_stat.tdo;
		sum_numOfDeaths += party_stat.numOfDeaths;
	}
	return {
		name: "Player " + (this.index + 1),
		tdo: sum_tdo,
		dps: sum_tdo / battleDuration,
		numOfDeaths: sum_numOfDeaths
	};
}




/**
	@class
	@classdesc A priority queue using 't' as key.
*/
function Timeline(){
	this.list = [];
}

/** 
	Add an item.
	@param {{t: number}} e The item to add.
*/
Timeline.prototype.insert = function(e){
	this.list.push(e);
	let i = this.list.length-1, j;
	while ((j = Math.floor((i-1)/2)) >= 0){
		if (this.list[j].t > this.list[i].t){
			let temp = this.list[i];
			this.list[i] = this.list[j];
			this.list[j] = temp;
		}else{
			break;
		}
		i = j;
	}
}

/**
	Remove the item with the smallest key.
	@return {{t: number}} The item with the smallest key.
*/
Timeline.prototype.extract_min = function(){
	if (this.list.length == 0){
		return null;
	}
	let e = this.list[0], i = 0, j;
	this.list[0] = this.list[this.list.length-1];
	this.list.pop();
	while ((j = 2*i + 1) < this.list.length){
		if (j+1 < this.list.length && this.list[j+1].t < this.list[j].t){
			m = j+1;
		}else{
			m = j;
		}
		if (this.list[i].t > this.list[m].t){
			let temp = this.list[i];
			this.list[i] = this.list[m];
			this.list[m] = temp;
		}else{
			break;
		}
		i = m;
	}
	return e;
}

/**
	Shift the key of every item by a constant.
	@param {number} dkey The constant change of key.
*/
Timeline.prototype.shift_key = function(dkey){
	for (var i = 0; i < this.list.length; i++){
		this.list[i].t += dkey;
	}
}




/**
	@class
	@classdesc The highest-level class, where the battle takes place.
	@param {Object} cfg The structured simulation input.
*/
function World(cfg){
	// Configure general parameters
	this.battleMode = cfg.battleMode;
	this.timelimit = parseInt(cfg.timelimit);
	if (!this.timelimit > 0){
		this.timelimit = -1;
	}
	this.weather = cfg.weather || "EXTREME";
	this.hasLog = cfg.hasLog || false;
	this.dodgeBugActive = parseInt(cfg.dodgeBugActive) || false;
	
	// Configure players
	this.players = [];
	for (let player of cfg.players){
		this.players.push(new Player(player));
	}
	// Configure matchups
	for (let player of this.players){
		for (let player2 of this.players){
			if (player2.team != player.team){ // If you are not in my team, then you are my enemy!
				player.rivals.push(player2);
			}
		}
	}
	// Give each player an index for battle log usage
	// Give each Pokemon a unique ID for later comparison purpose
	let pokemon_id = 0, player_index = 0;
	for (player of this.players){
		player.index = player_index++;
		for (party of player.parties){
			for (pokemon of party.pokemon){
				pokemon.id = pokemon_id++;
			}
		}
	}
	// Nullify revive strategy if unlimited time
	if (this.timelimit < 0){
		for (let player of this.players){
			if (player.team == "0"){
				for (let party of player.parties){
					party.revive = false;
				}
			}
		}
	}
	this.timeline = new Timeline();
	this.battleDuration = 0;
	this.log = [];
}

/** 
	Initialize for a new battle.
*/
World.prototype.init = function(){
	for (let player of this.players){
		player.init();
	}
	this.timeline = new Timeline();
	this.battleDuration = 0;
	this.log = [];
}

/**
	A Pokemon uses an attack.
	@param {Pokemon} pkm The pokemon who will use an attack.
	@param {Move} move The move used by the Pokemon.
	@param {number} t The time of the attack.
*/
World.prototype.pokemonUsesAttack = function(pkm, move, t){
	pkm.incrementAttackCount(move.moveType);
	
	var tHurt = t + move.dws;
	if (this.battleMode == 'pvp'){
		tHurt = t;
	}
	
	let energyDeltaEvent = {
		name: EVENT_TYPE.EnergyDelta, t: tHurt, subject: pkm, energyDelta: move.energyDelta
	};
	this.timeline.insert(energyDeltaEvent);
	
	let damageEvent = {
		name: EVENT_TYPE.Damage, t: tHurt, subject: pkm, move: move
	};
	this.timeline.insert(damageEvent);
}

/**
	A Pokemon announces its next action.
	@param {Pokemon} pkm The pokemon who is annoucing.
	@param {number} t The time of the action.
	@param {Object} action The action the Pokemon will take.
*/
World.prototype.pokemonBroadcasts = function(pkm, t, action){
	action.t = t + action.delay || 0;
	action.from = pkm;
	for (let rival of pkm.master.rivals){
		let target = rival.head();
		if (target && target.active){
			target.projectedRivalActions.insert(action);
		}
	}
}

/**
	Register the action of a Pokemon by queuing appropriate events.
	This method only queues events, not handles them, therefore this method does not change the internal simulator state.
	@param {Pokemon} pkm The pokemon who performs the attack.
	@param {number} t The time of the action.
	@param {Object} action The action performed by the Pokemon.
	@return {number} The time when the Pokemon will be free again for another action.
*/
World.prototype.registerAction = function(pkm, t, action){
	if (!action){
		action = {};
	}
	t += action.delay || 0;
	if (action.name == "fast"){ // Use fast move
		if (pkm.role == "a" && this.battleMode != 'pvp'){ // Add lag for human player's Pokemon
			t += Data.BattleSettings.fastMoveLagMs;
		}
		this.timeline.insert({
			name: EVENT_TYPE.Announce, t: t, subject: pkm, move: pkm.fmove
		});
		t += pkm.fmove.duration;
	}else if (action.name == "charged"){ // Use charged move
		var cmove = pkm.cmove;
		if (typeof action.index == typeof 0){
			cmove = pkm.cmoves[action.index];
		}
		if (pkm.energy + cmove.energyDelta >= 0){ // Energy requirement check
			if (pkm.role == "a" && this.battleMode != 'pvp'){ // Add lag for human player's Pokemon
				t += Data.BattleSettings.chargedMoveLagMs;
			}
			if (this.battleMode == 'pvp'){
				this.timeline.shift_key(Data.BattleSettings.minigameDurationMs);
				this.timeline.insert({
					name: EVENT_TYPE.Announce, t: t + Math.round(Data.BattleSettings.minigameDurationMs * 0.5), subject: pkm, move: cmove
				});
				pkm.chargedAttackBonus = Data.BattleSettings.chargedAttackBonusMultiplier;
				for (let rival of pkm.master.rivals){ // Ask each enemy whether to use Protect Shield
					var enemy = rival.head();
					if (enemy && rival.protectShieldLeft > 0 && enemy.protectStrategy.decide()){
						this.timeline.insert({
							name: EVENT_TYPE.Protect, t: t, subject: enemy
						});
					}
				}
				t = t + Data.BattleSettings.minigameDurationMs;
			}else{
				this.timeline.insert({
					name: EVENT_TYPE.Announce, t: t, subject: pkm, move: cmove
				});
				t += cmove.duration;
			}
		}else{ // Insufficient energy, wait for 100ms and do nothing
			t += 100;
		}
	}else if (action.name == "dodge"){ // dodge
		this.timeline.insert({
			name: EVENT_TYPE.Dodge, t: t, subject: pkm
		});
		t += Data.BattleSettings.dodgeDurationMs;
	}else if (action.name == "switch"){
		this.timeline.insert({
			name: EVENT_TYPE.Switch, t: t + Data.BattleSettings.swapDurationMs, subject: pkm, index: action.index
		});
	}
	
	return t;
}

/**
	Check if any player of the team is still in game.
	@param {string} team The team to check whether it's defeated or not.
	@return {boolean} true if it's defeated and false otherwise.
*/
World.prototype.isTeamDefeated = function(team){
	for (let player of this.players){
		if (player.team == team){
			let pokemon = player.head();
			if (pokemon && pokemon.isAlive()){
				return false;
			}
		}
	}
	return true;
}

/**
	Simulate a new battle.
*/
World.prototype.battle = function(){
	var t = 0;
	var timelimit = this.timelimit;
	var defeatedTeam = "";
	var faintedPokemon = [];
	
	t += Data.BattleSettings.arenaEntryLagMs;
	this.battleDuration -= Data.BattleSettings.arenaEntryLagMs;
	timelimit -= Data.BattleSettings.arenaEarlyTerminationMs;
	
	for (let player of this.players){
		this.timeline.insert({
			name: EVENT_TYPE.Enter, t: t, subject: player.head()
		});
	}

	while (!defeatedTeam && (t < timelimit || timelimit < 0) && this.battleDuration < MAX_BATTLE_DURATION_MS){
		let e = this.timeline.extract_min();
		t = e.t;

		// Process the event
		if (e.name == EVENT_TYPE.Free){
			if (e.subject.active){
				let currentAction = e.subject.queuedAction;
				let tFree = this.registerAction(e.subject, t, currentAction);
				if (currentAction && (e.subject.role == "gd" || e.subject.role == "rb")){
					// Gym Defenders and Raid Bosses are forced to broadcast
					this.pokemonBroadcasts(e.subject, t, currentAction);
				}
				e.subject.queuedAction = e.subject.choose({
					subject: e.subject, t: t, tFree: tFree,
					currentAction: currentAction, weather: this.weather, dodgeBugActive: this.dodgeBugActive
				});
				this.timeline.insert({
					name: EVENT_TYPE.Free, t: tFree, subject: e.subject
				});
			}
		}else if (e.name == EVENT_TYPE.Announce){
			this.pokemonUsesAttack(e.subject, e.move, t);
		}else if (e.name == EVENT_TYPE.Damage){
			if (e.subject.active){
				for (let rival of e.subject.master.rivals){
					let target = rival.head();
					if (!target || !target.active){ 
						continue;
					}
					let dmg = damage(e.subject, target, e.move, this.weather);
					if (t < target.damageReductionExpiration){
						dmg = Math.max(1, Math.floor(dmg * (1 - target.damageReductionPercent)));
					}
					target.takeDamage(dmg);
					e.subject.attributeDamage(dmg, e.move.moveType);
					if (!target.isAlive()){
						target.active = false;
						faintedPokemon.push(target);
					}
					if (this.battleMode != "pvp"){
						target.gainEnergy(Math.ceil(dmg * Data.BattleSettings.energyDeltaPerHealthLost));
					}
					let hurtEvent = { // For battle log only
						name: EVENT_TYPE.Hurt, t: t, subject: target, object: e.subject, move: e.move, dmg: dmg
					};
					this.appendEventToLog(hurtEvent);
				}
			}
		}else if (e.name == EVENT_TYPE.EnergyDelta){
			e.subject.gainEnergy(e.energyDelta);
		}else if (e.name == EVENT_TYPE.MoveEffect){
			this.handleMoveEffect(e);
			this.appendEventToLog(e);
		}else if (e.name == EVENT_TYPE.Dodge){
			e.subject.damageReductionExpiration = t + Data.BattleSettings.dodgeWindowMs;
			e.subject.damageReductionPercent = Data.BattleSettings.dodgeDamageReductionPercent;
			this.appendEventToLog(e);
		}else if (e.name == EVENT_TYPE.Protect){
			e.subject.damageReductionExpiration = t + Data.BattleSettings.minigameDurationMs;
			e.subject.damageReductionPercent = Data.BattleSettings.protectShieldDamageReductionPercent;
			e.subject.master.protectShieldLeft--;
			this.appendEventToLog(e);
		}else if (e.name == EVENT_TYPE.Enter){
			e.subject.timeEnterMs = t;
			e.subject.active = true;
			this.timeline.insert({
				name: EVENT_TYPE.Free, t: t, subject: e.subject
			});
			for (let rival of e.subject.master.rivals){
				rival.head().adjustDefaultChargedMove(e.subject, this.weather);
			}
			this.appendEventToLog(e);
		}else if (e.name == EVENT_TYPE.Switch){
			let player = e.subject.master;
			if (this.battleMode != "pvp" || t >= player.switchingCooldownExpiration){
				var party = player.headParty();
				if (party.switchPokemon(e.index)){
					e.subject.active = false;
					this.timeline.insert({
						name: EVENT_TYPE.Enter, t: t + Data.BattleSettings.swapDurationMs, subject: party.head()
					});
					if (this.battleMode == "pvp"){
						player.switchingCooldownExpiration = t + Data.BattleSettings.switchingCooldownDurationMs;
					}
				}
			}
		}
		
		// Check if some Pokemon fainted and handle it
		while (faintedPokemon.length){
			let fpkm = faintedPokemon.pop();
			let player = fpkm.master;
			let party = player.headParty();
			fpkm.activeDurationMs += t - fpkm.timeEnterMs;
			if (fpkm.role == "gd" && this.battleMode == "gym"){
				// A gym defender's fainting will reset the timelimit if the battle mode is "gym"
				timelimit += t - this.battleDuration;
				this.battleDuration = t;
			}
			if (this.battleMode == 'pvp' && player.selectBestPokemon() || player.selectNextPokemon()){ // Select next Pokemon from current party
				this.timeline.insert({
					name: EVENT_TYPE.Enter, t: t + Data.BattleSettings.swapDurationMs, subject: player.head()
				});
			}else if (party.revive){ // Max revive current party and re-lobby
				party.heal();
				this.timeline.insert({
					name: EVENT_TYPE.Enter, 
					t: t + Data.BattleSettings.rejoinDurationMs + Data.BattleSettings.itemMenuAnimationTimeMs + party.pokemon.length * Data.BattleSettings.maxReviveTimePerPokemonMs,
					subject: player.head()
				});
			}else if (player.selectNextParty()){ // Select next Party and re-lobby
				this.timeline.insert({
					name: EVENT_TYPE.Enter, 
					t: t + Data.BattleSettings.rejoinDurationMs,
					subject: player.head()
				});
			}else{ // This player is done. Check if his team is defeated
				if (this.isTeamDefeated(player.team)){
					defeatedTeam = player.team;
				}
			}
		}
		
		// Fetch and process the next event if it's at the same time
		if (this.timeline.list.length > 0 && t == this.timeline.list[0].t){
			continue;
		}
	}
	
	// Battle has ended, some leftovers to handle	
	this.battleDuration = t;
	for (let player of this.players){
		let pkm = player.head();
		if (pkm && pkm.active){
			pkm.activeDurationMs += t - pkm.timeEnterMs;
		}
	}
}

/**
	Handles the move effect of the move.
	@param {Object} e The event to handle.
*/
World.prototype.handleMoveEffect = function(e){
	// TODO
	let effect = e.move.effect;
	if (effect.name == "statMod"){
		
	}
}

/**
	Log the simulator event.
	@param {Object} e Event to log.
*/
World.prototype.appendEventToLog = function(e){
	if (!this.hasLog){
		return;
	}
	// Prepare a formatted log entry.
	let entry = {
		t: e.t,
		events: new Array(this.players.length)
	};
	if (e.name == EVENT_TYPE.Enter){
		entry.events[e.subject.master.index] = {
			type: 'pokemon',
			eventType: EVENT_TYPE.Enter,
			name: e.subject.name,
			nickname: e.subject.nickname
		};
	}else if (e.name == EVENT_TYPE.Hurt){
		entry.events[e.subject.master.index] = {
			eventType: EVENT_TYPE.Hurt,
			text: e.subject.HP + "(-" + e.dmg + ")",
			value: e.dmg,
			value2: e.subject.HP
		};
		entry.events[e.object.master.index] = {
			type: e.move.moveType + 'Move', 
			name: e.move.name
		};
	}else if (e.name == EVENT_TYPE.Dodge){
		entry.events[e.subject.master.index] = {
			type: 'text',
			text: 'Dodge'
		};
	}else if (e.name == EVENT_TYPE.Protect){
		entry.events[e.subject.master.index] = {
			type: 'text', 
			text: 'Protect Shield'
		};
	}
	
	// Append the log entry to the log list. Try to merge with the last entry if possible.
	if (this.log.length == 0){
		this.log.push(entry);
		return;
	}
	var lastEntry = this.log[this.log.length - 1];
	if (entry.t != lastEntry.t){
		this.log.push(entry);
		return;
	}
	var mergedEntry = {
		t: entry.t,
		events: new Array(this.players.length)
	};
	for (var i = 0; i < this.players.length; i++){
		var cur = entry.events[i], prev = lastEntry.events[i];
		if (cur && prev){
			if (cur.eventType == EVENT_TYPE.Hurt && prev.eventType == EVENT_TYPE.Hurt){
				mergedEntry.events[i] = {
					type: 'text',
					eventType: EVENT_TYPE.Hurt,
					text: prev.value2 + "(-" + (prev.value + cur.value) + ")",
					value: prev.value + cur.value,
					value2: prev.value2
				};
			}else if (prev.name && prev.name == cur.name) {
				mergedEntry.events[i] = prev;
			}else{
				this.log.push(entry);
				return;
			}
		}else{
			mergedEntry.events[i] = cur || prev;
		}
	}
	this.log.pop();
	this.log.push(mergedEntry);
}


/**
	Get the battle result. This method is used for the termination condition for the main battle() function.
	@return {number} 1 if team "1" is defeated, 0 otherwise.
*/
World.prototype.getBattleResult = function(){
	return this.isTeamDefeated("1") ? 1 : 0;
}

/** 
	Get the battle performance metrics and batte log of the simulation.
	@return {{generalStat, playerStats, pokemonStats, battleLog}} Battle performance metrics.
*/
World.prototype.getStatistics = function(){
	let general_stat = {};
	let player_stats = [];
	let pokemon_stats = [];
	
	general_stat['duration'] = this.battleDuration/1000;
	general_stat['battle_result'] = this.getBattleResult();
	let sumTDO = 0, sumMaxHP = 0;
	general_stat['numOfDeaths'] = 0;
	for (let player of this.players){
		let ts = player.getStatistics(general_stat['duration']);
		if (player.team == "0"){
			general_stat['numOfDeaths'] += ts['numOfDeaths'];
		}
		player_stats.push(ts);
		let playerStat = [];
		for (let party of player.parties){
			let partyStat = [];
			for (let pokemon of party.pokemon){
				partyStat.push(pokemon.getStatistics());
				if (player.team == "0"){
					sumTDO += pokemon.tdo;
				}else{
					sumMaxHP += pokemon.maxHP;
				}
			}
			playerStat.push(partyStat);
		}
		pokemon_stats.push(playerStat);
	}
	general_stat['tdo'] = sumTDO;
	general_stat['tdo_percent'] = sumTDO / sumMaxHP * 100;
	general_stat['dps'] = sumTDO / (this.battleDuration/1000);
	
	return {
		generalStat: general_stat,
		playerStats: player_stats,
		pokemonStats: pokemon_stats,
		battleLog: this.log
	};	
}


/**
	@class
	@classdesc Protect Shield strategy.
	@param {string} S The string to indicate the strategy (see parse() function below for the format).
*/
function ProtectShieldStrategy(S){
	this.rawString = (S || "").toString();
	this.init();
}

/**
	Initialize the protect shield strategy.
*/
ProtectShieldStrategy.prototype.init = function(){
	this.parse(this.rawString);
}

/**
	Parse protect shield strategy.
	@param {string} S The string in the format of "n_1, n_2", where n_i is the number of charged attack tanked before using the i Protect Shield. "*" for infinity, "?" for random.
*/
ProtectShieldStrategy.prototype.parse = function(S){
	var arr = S.split(",");
	if (arr.length < 2){
		arr.push("0");
	}else if (arr.length >= 2){
		arr = arr.slice(0, 2);
	}
	this.attacksToTank = [];
	for (let a of arr){
		var n = parseInt(a);
		if (n >= 0){
			this.attacksToTank.push(n);
		}else if (a == '*'){
			this.attacksToTank.push(a);
		}else if (a == '?'){
			this.attacksToTank.push(a);
		}else{
			this.attacksToTank.push(0);
		}
	}
}

/**
	Decide whether to use Protect Shield or not.
	@param {Object} kwargs Keyword arguments as input parameters.
	@return {boolean} true if use Protect Shield and false otherwise.
*/
ProtectShieldStrategy.prototype.decide = function(kwargs){
	if (this.attacksToTank.length == 0){
		return false;
	}
	var a = this.attacksToTank[0];
	if (a > 0){
		this.attacksToTank[0]--;
		return false;
	}else if (a == 0){
		this.attacksToTank.shift();
		return true;
	}else if (a == '*'){
		return false;
	}else if (a == '?'){
		if (Math.random() < 0.5){
			this.attacksToTank.shift();
			return true;
		}else{
			return false;
		}
	}
}



/**
	Defender AI strategy.
	@param {Object} state Information for making the decision.
	@return {{name: string, delay: number, index: number}} The action decided to take.
*/
function strat0(state){
	let actionName, delay;
	if (this.actionCount >= 2){
		let projectedEnergyDelta = 0;
		if (state.currentAction.name == "fast"){
			projectedEnergyDelta = this.fmove.energyDelta;
		}else if (state.currentAction.name == "charged"){
			projectedEnergyDelta = this.cmove.energyDelta;
		}
		if (this.energy + projectedEnergyDelta + this.cmove.energyDelta >= 0 && Math.random() <= 0.5){
			actionName = "charged";
		}else{
			actionName = "fast";
		}
		delay = 1500 + round(1000 * Math.random()); // Add the standard defender delay
	}else if (this.actionCount == 1){ // The second action
		actionName = "fast";
		delay = Math.max(0, 1000 - this.fmove.duration);
	}else{ // The first action
		actionName = "fast";
		delay = 500;
	}
	this.actionCount++;
	
	return {
		name: actionName,
		delay: delay
	};
}


/**
	Attacker strategy: No dodging.
	@param {Object} state Information for making the decision.
	@return {{name: string, delay: number, index: number}} The action decided to take.
*/
function strat1(state){
	var subject = state.subject;
	let projectedEnergyDelta = 0;
	let currentAction = state.currentAction;
	if (currentAction){
		if (currentAction.name == "fast"){
			projectedEnergyDelta = subject.fmove.energyDelta;
		}else if (currentAction.name == "charged"){
			if (typeof currentAction.index == typeof 0)
				projectedEnergyDelta = subject.cmoves[currentAction.index].energyDelta;
			else
				projectedEnergyDelta = subject.cmove.energyDelta;
		}
	}
	if (subject.energy + projectedEnergyDelta + subject.cmove.energyDelta >= 0){
		return {name: "charged", delay: 0};
	}else{
		return {name: "fast", delay: 0};
	}
}


/**
	Attacker strategy: Dodge Charged
	@param {Object} state Information for making the decision.
	@return {{name: string, delay: number, index: number}} The action decided to take.
*/
function strat2(state){
	var subject = state.subject;
	if (state.t < state.tFree){
		return;
	}
	let rivalAttackAction = this.projectedRivalActions.extract_min();
	while (rivalAttackAction){
		if (rivalAttackAction.name == "charged")
			break;
		rivalAttackAction = this.projectedRivalActions.extract_min();
	}
	var hurtEvent = null;
	if (rivalAttackAction){
		var enemy_move = (rivalAttackAction.name == "fast" ? rivalAttackAction.from.fmove : rivalAttackAction.from.cmove);
		hurtEvent = {
			move: enemy_move,
			t: rivalAttackAction.t + enemy_move.dws,
			dmg: damage(rivalAttackAction.from, subject, enemy_move, state.weather)
		};
	}
	
	if (hurtEvent && subject.damageReductionExpiration < hurtEvent.t){
		let undodgedDmg = hurtEvent.dmg;
		let dodgedDmg = Math.max(1, Math.floor(undodgedDmg * (1 - Data.BattleSettings.dodgeDamageReductionPercent)));
		if (state.dodgeBugActive){
			dodgedDmg = undodgedDmg;
		}
		if (dodgedDmg < subject.HP){
			let timeTillHurt = hurtEvent.t - state.tFree;
			if (subject.energy + subject.cmove.energyDelta >= 0 && timeTillHurt > subject.cmove.duration + Data.BattleSettings.chargedMoveLagMs){
				// Fit in another charge move
				this.projectedRivalActions.insert(rivalAttackAction); // Put the broadcasted action for next decision making
				return {name: "charged", delay: 0};
			}else if (timeTillHurt > subject.fmove.duration + Data.BattleSettings.fastMoveLagMs){
				// Fit in another fast move
				this.projectedRivalActions.insert(rivalAttackAction); // Put the broadcasted action for next decision making
				return {name: "fast", delay: 0};
			}else{
				// Dodge, and delay a little bit to wait for damage window if necessary
				return {
					name: "dodge",
					delay: Math.max(0, timeTillHurt - Data.BattleSettings.dodgeWindowMs)
				};
			}
		}
	}

	return strat1(state);
}


/**
	Attacker strategy: Dodge All
	@param {Object} state Information for making the decision.
	@return {{name: string, delay: number, index: number}} The action decided to take.
*/
function strat3(state){
	var subject = state.subject;
	if (state.t < state.tFree){
		return;
	}
	let rivalAttackAction = this.projectedRivalActions.extract_min();
	while (rivalAttackAction){
		if (rivalAttackAction.name == "fast" || rivalAttackAction.name == "charged")
			break;
		rivalAttackAction = this.projectedRivalActions.extract_min();
	}
	var hurtEvent = null;
	if (rivalAttackAction){
		var enemy_move = (rivalAttackAction.name == "fast" ? rivalAttackAction.from.fmove : rivalAttackAction.from.cmove);
		hurtEvent = {
			move: enemy_move,
			t: rivalAttackAction.t + enemy_move.dws,
			dmg: damage(rivalAttackAction.from, subject, enemy_move, state.weather)
		};
	}
	
	if (hurtEvent && subject.damageReductionExpiration < hurtEvent.t){
		let undodgedDmg = hurtEvent.dmg;
		let dodgedDmg = Math.max(1, Math.floor(undodgedDmg * (1 - Data.BattleSettings.dodgeDamageReductionPercent)));
		if (state.dodgeBugActive){
			dodgedDmg = undodgedDmg;
		}
		if (dodgedDmg < subject.HP){
			let timeTillHurt = hurtEvent.t - state.tFree;
			if (subject.energy + subject.cmove.energyDelta >= 0 && timeTillHurt > subject.cmove.duration + Data.BattleSettings.chargedMoveLagMs){
				// Fit in another charge move
				this.projectedRivalActions.insert(rivalAttackAction); // Put the broadcasted action for next decision making
				return {name: "charged", delay: 0};
			}else if (timeTillHurt > subject.fmove.duration + Data.BattleSettings.fastMoveLagMs){
				// Fit in another fast move
				this.projectedRivalActions.insert(rivalAttackAction); // Put the broadcasted action for next decision making
				return {name: "fast", delay: 0};
			}else{
				// Dodge, and delay a little bit to wait for damage window if necessary
				return {
					name: "dodge",
					delay: Math.max(0, timeTillHurt - Data.BattleSettings.dodgeWindowMs)
				};
			}
		}
	}

	return strat1(state);
}


/**
	Attacker strategy: No dodging + Burst charge move
	@param {Object} state Information for making the decision.
	@return {{name: string, delay: number, index: number}} The action decided to take.
*/
function strat4(state){
	var subject = state.subject;
	let projectedEnergyDelta = 0;
	let currentAction = state.currentAction;
	if (currentAction){
		if (currentAction.name == "fast"){
			projectedEnergyDelta = subject.fmove.energyDelta;
		}else if (currentAction.name == "charged"){
			if (typeof currentAction.index == typeof 0)
				projectedEnergyDelta = subject.cmoves[currentAction.index].energyDelta;
			else
				projectedEnergyDelta = subject.cmove.energyDelta;
		}
	}
	var projectEnergy = subject.energy + projectedEnergyDelta;
	if (projectEnergy >= Data.BattleSettings.maximumEnergy || (projectEnergy + subject.cmove.energyDelta >= 0 && currentAction && currentAction.name == "charged")){
		return {name: "charged", delay: 0};
	}else{
		return {name: "fast", delay: 0};
	}
}