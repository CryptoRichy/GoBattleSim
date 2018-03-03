/* Helper functions */
function getPokemonType1FromString(S){
	var L = S.split(",");
	return L[0].trim().toLowerCase();
}

function getPokemonType2FromString(S){
	var L = S.split(",");
	if (L.length > 1)
		return L[1].trim().toLowerCase();
	else
		return "none";
}

function getMovesFromString(S){
	var res = [];
	var L = S.split(",");
	for (var i = 0; i < L.length; i++){
		var moveName = L[i].trim().toLowerCase();
		if (moveName.length > 0)
			res.push(moveName);
	}
	return res;
}

// Populate default input options
function populateAll(){
	if (POKEMON_SPECIES_DATA_FETCHED && MOVE_DATA_FETCHED && USER_POKEBOX_FETCHED){
		for (var i = 0; i < USER_POKEBOX.length; i++){
			USER_POKEBOX[i].box_index = i;
			POKEMON_SPECIES_OPTIONS.push("$" + i + " " + USER_POKEBOX[i].nickname);
		}
		for (var i = 0; i < POKEMON_SPECIES_DATA.length; i++){
			POKEMON_SPECIES_OPTIONS.push(POKEMON_SPECIES_DATA[i].name);
		}
		for (var i = 0; i < FAST_MOVE_DATA.length; i++){
			FAST_MOVES_OPTIONS.push(FAST_MOVE_DATA[i].name);
		}
		for (var i = 0; i < CHARGED_MOVE_DATA.length; i++){
			CHARGED_MOVE_OPTIONS.push(CHARGED_MOVE_DATA[i].name);
		}
		addTeam();
		setDefenderInput();
	}
}
/* End of Helper Functions */

var POKEMON_SPECIES_DATA_FETCHED = false;
var MOVE_DATA_FETCHED = false;
var USER_POKEBOX_FETCHED = false;


// TODO: Get CPM data: https://pokemongo.gamepress.gg/assets/data/cpm.json

// Read Pokemon Data
$.ajax({ 
	url: 'https://game-press.nyc3.digitaloceanspaces.com/sites/pogo/pokemon-data-full.json?v2', 
	dataType: 'json', 
	success: function(data){
		for(var i = 0; i < data.length; i++){
			var pkmData = {
				dex : parseInt(data[i].number),
				name : data[i].title_1.toLowerCase(),
				pokeType1 : getPokemonType1FromString(data[i].field_pokemon_type),
				pokeType2 : getPokemonType2FromString(data[i].field_pokemon_type),
				baseAtk : parseInt(data[i].atk),
				baseDef : parseInt(data[i].def),
				baseStm : parseInt(data[i].sta),
				fastMoves : getMovesFromString(data[i].field_primary_moves),
				chargedMoves : getMovesFromString(data[i].field_secondary_moves),
				fastMoves_legacy : getMovesFromString(data[i].field_legacy_quick_moves),
				chargedMoves_legacy : getMovesFromString(data[i].field_legacy_charge_moves),
				exclusiveMoves : getMovesFromString(data[i].exclusive_moves),
				rating : parseFloat(data[i].rating) || 0
			};
			if (!POKEMON_BY_TYPE_INDICES.hasOwnProperty(pkmData.pokeType1))
				POKEMON_BY_TYPE_INDICES[pkmData.pokeType1] = [];
			POKEMON_BY_TYPE_INDICES[pkmData.pokeType1].push(i);
			if (!POKEMON_BY_TYPE_INDICES.hasOwnProperty(pkmData.pokeType2))
				POKEMON_BY_TYPE_INDICES[pkmData.pokeType2] = [];
			POKEMON_BY_TYPE_INDICES[pkmData.pokeType2].push(i);
			
			if (pkmData.rating >= 2.5)
				RELEVANT_ATTACKERS_INDICES.push(i);

			POKEMON_SPECIES_DATA.push(pkmData);
		}
		POKEMON_SPECIES_DATA_FETCHED = true;
	},
	complete: function(jqXHR, textStatus){
		populateAll();
	}
});		
		

// Read move data
$.ajax({
	url: 'https://game-press.nyc3.digitaloceanspaces.com/sites/pogo/move-data-full.json', 
	dataType: 'json', 
	success: function(data){
		for(var i = 0; i < data.length; i++){
			if (data[i].move_category == "Fast Move"){
				FAST_MOVE_DATA.push({
					name: data[i].title.toLowerCase(),
					moveType: "f",
					power: parseInt(data[i].power),
					pokeType: data[i].move_type.toLowerCase(),
					energyDelta: parseInt(data[i].energy_gain),
					dws: parseFloat(data[i].damage_window.split(' ')[0])*1000,
					duration: parseFloat(data[i].cooldown)*1000
				});
			}else if (data[i].move_category == "Charge Move"){
				CHARGED_MOVE_DATA.push({
					name: data[i].title.toLowerCase(),
					moveType: "c",
					power: parseInt(data[i].power),
					pokeType: data[i].move_type.toLowerCase(),
					energyDelta: parseInt(data[i].energy_cost),
					dws: parseFloat(data[i].damage_window.split(' ')[0])*1000,
					duration: parseFloat(data[i].cooldown)*1000
				});
			}else{
				console.log("Unrecogized move type:");
				console.log(data[i]);
			}
		}
		MOVE_DATA_FETCHED = true;
	},
	complete: function(jqXHR, textStatus){
		populateAll();
	}
});

	
// Read User Pokebox
$(document).ready(function(){
	if(userID2){
		$.ajax({ 
			url: '/user-pokemon-json-list?uid_raw=' + userID2, 
			dataType: 'json',
			success: function(data){ 
				for (var i = 0; i < data.length; i++){
					var species_idx = get_species_index_by_name(data[i].species.toLowerCase());
					if (species_idx >= 0){
						var pkmRaw = {
							index : species_idx,
							species : data[i].species.toLowerCase(),
							copies: 1,
							level: 0,
							baseStm : POKEMON_SPECIES_DATA[species_idx].baseStm,
							baseAtk : POKEMON_SPECIES_DATA[species_idx].baseAtk,
							baseDef : POKEMON_SPECIES_DATA[species_idx].baseDef,
							stmiv: parseInt(data[i].sta),
							atkiv: parseInt(data[i].atk),
							defiv: parseInt(data[i].def),
							fmove: data[i].fast_move.toLowerCase(),
							fmove_index : get_fmove_index_by_name(data[i].fast_move.toLowerCase()),
							cmove: data[i].charge_move.toLowerCase(),
							cmove_index : get_cmove_index_by_name(data[i].charge_move.toLowerCase()),
							dodge: 0,
							nickname : data[i].nickname
						};
						if (pkmRaw.fmove_index < 0){
							console.log("Move data not found: " + pkmRaw.fmove);
							continue;
						}
						if (pkmRaw.cmove_index < 0){
							console.log("Move data not found: " + pkmRaw.cmove);
							continue;
						}
						pkmRaw.level = calculateLevelByCP(pkmRaw, parseInt(data[i].cp));
						USER_POKEBOX.push(pkmRaw);
					}
				}
			},
			complete: function(jqXHR, textStatus){
				populateAll();
			}
		});
	}
	USER_POKEBOX_FETCHED = true;
});