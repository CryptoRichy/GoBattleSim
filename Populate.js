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
	var L = S.split(",");
	var res = [];
	for (var i = 0; i < L.length; i++)
		res.push(L[i].trim().toLowerCase());
	return res;
}
/* End of Helper Functions */





// Read Pokemon Data
$.getJSON('https://game-press.nyc3.digitaloceanspaces.com/sites/pogo/pokemon-data-full.json?v2',
	function(data) {
		for(var i = 0; i < data.length; i++){
			POKEMON_SPECIES_DATA.push({
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
				chargedMoves_legacy : getMovesFromString(data[i].field_legacy_charge_moves)
			});
		}
	});



// Read move data
$.getJSON('https://game-press.nyc3.digitaloceanspaces.com/sites/pogo/move-data-full.json',
	function(data) {
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
	});

		
		

$(document).ready(function(){
	if(userID2){
		$.getJSON('/user-pokemon-json-list?uid_raw=' + userID2,
		function(data) {
			for (var i = 0; i < data.length; i++){
				var species_idx = get_species_index_by_name(data[i].species.toLowerCase());
				if (species_idx >= 0){
					var pkmRaw = {
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
						cmove: data[i].charge_move.toLowerCase(),
						dodge: 0,
						nickname : data[i].nickname
					};
					pkmRaw.level = calculateLevelByCP(pkmRaw, parseInt(data[i].cp));
					USER_POKEBOX.push(pkmRaw);
				}
			}			
		});
	}
	
	// Populate datalists
	var speciesNameDataList = document.getElementById("SpeciesNameDataList");
	var FMovesDataList = document.getElementById("FMovesDataList");
	var CMovesDataList = document.getElementById("CMovesDataList");
	

	for (var i = 0; i < POKEMON_SPECIES_DATA.length; i++){
		var nameOption = document.createElement("option");
		nameOption.value = POKEMON_SPECIES_DATA[i].name;
		speciesNameDataList.appendChild(nameOption);
	}


	for (var i = 0; i < FAST_MOVE_DATA.length; i++){
		var nameOption = document.createElement("option");
		nameOption.value = FAST_MOVE_DATA[i].name;
		FMovesDataList.appendChild(nameOption);
	}


	for (var i = 0; i < CHARGED_MOVE_DATA.length; i++){
		var nameOption = document.createElement("option");
		nameOption.value = CHARGED_MOVE_DATA[i].name;
		CMovesDataList.appendChild(nameOption);
	}
	
	// Final
	addTeam();
	setDefenderInput();
	
});