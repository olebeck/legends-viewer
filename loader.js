import * as THREE from 'three'; 

class LegendsMaterialLoader extends THREE.Loader {
    constructor( manager ) {
        super( manager );
        this.face_poses = null;
    }

    setFacePoses(face_poses) {
        console.log({face_poses});
        this.face_poses = face_poses;
    }

    shader_face_poses(shader, height) {
        // SUPER hacky
        let x = 1, y = 1;
        switch (this.face_poses.length) {
            case 18:
                x = 9; y = 3;
                break;
            case 9:
                x = 18; y = height/16;
            case 3:
                x = 3; y = height/12;
                break;
            case 2:
                x = 2; y = height/16;
        }
        shader.vertexShader = shader.vertexShader.replace(
            '#include <uv_vertex>',
            `
                #include <uv_vertex>
                #ifdef USE_UV
                vUv /= vec2(${x},${y});
                #endif
            `
        )
    }

    load(filename, onLoad, onProgress, onError) {
        const scope = this;

		const loader = new THREE.FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
        loader.setResponseType("json");
		loader.load( filename, function ( json ) {
            const name = filename.split("/").at(-1).split(".").at(0);
            const key = Object.keys(json).find(e => e.split(":")[0] == name);
            const jm = json[key];
            const materialBase = key.split(":")[1];

            const material = new THREE.MeshStandardMaterial({
                color: 0xaaeeff,
                side: THREE.DoubleSide,
                transparent: true,
                alphaTest: 0.0001,
                name: name,
            });

            let height = 0;

            if(["base_entity_hero_face", "base_entity_face"].includes(materialBase)) {
                material.onBeforeCompile = (shader) => scope.shader_face_poses(shader, height);
                material.customProgramCacheKey = () => {return `shader_face_poses ${scope.face_poses.length}`}
            }

            const types = {"diffuseMap": "map", "coeffMap": null, "normalMap": "normalMap", "emissiveMap": "emissiveMap"};

            for(const jt in jm.textures) {
                const loader = new THREE.TextureLoader( scope.manager );
                loader.setPath(scope.path);
                loader.setCrossOrigin( scope.crossOrigin );

                const type = types[jt];
                if(type && material[type] !== undefined) {
                    loader.load( jm.textures[jt]+".png", (texture) => {
                        texture.magFilter = THREE.NearestFilter;
                        texture.minFilter = THREE.NearestFilter;
                        material[type] = texture;
                        height = texture.image.height;
                    }, null, (err) => {
                        console.error(err);
                        loader.load( jm.textures[jt]+".hdr", (texture) => {
                            texture.magFilter = THREE.NearestFilter;
                            texture.minFilter = THREE.NearestFilter;
                            material[type] = texture;
                            height = texture.image.height;
                        });
                    });
                }
            }
            onLoad(material);
        });
    }
}


export class LegendsModelLoader extends THREE.Loader {
    constructor( manager ) {
        super( manager );
        this.materials = new Map();
        this.materialLoader = null;
    }

    load( url, onLoad, onProgress, onError ) {
		const scope = this;
		const loader = new THREE.FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( url, function ( text ) {
			try {
				onLoad( scope.parse( text ) );
			} catch ( e ) {
				if ( onError ) {
					onError( e );
				} else {
					console.error( e );
				}
				scope.manager.itemError( url );
			}
		}, onProgress, onError );
	}

    addMaterial(name, material) {
        this.materials.set(name, material);
    }

    setMaterialLoader(materialLoader) {
        this.materialLoader = materialLoader;
    }

    parse( data ) {
        if(!this.materialLoader) {
            this.materialLoader = new LegendsMaterialLoader( this.manager );
            this.materialLoader.setPath( this.path );
        }

        const json = JSON.parse( data );
        const geometries = json["minecraft:geometry"];

        const materials = [];
        const material_indicies = {};
        for(const jm of geometries[0].meshes) {
            material_indicies[jm.meta_material] = jm;
        }
        for(const key of Object.keys(material_indicies)) {
            const jm = material_indicies[key];
            const i = materials.push(null)-1;
            material_indicies[key] = i;
            this.materialLoader.load(`materials/meta_materials/${jm.meta_material}.json`, function (material) {
                materials[i] = material;
            });
        }

        const geometry = new THREE.BufferGeometry();
        let indicies = [];
        let vertices = [];
        let normals = [];
        let uv = [];
        let skinIndices = [];
        let skinWeights = [];

        const skinnedMesh = new THREE.SkinnedMesh(geometry, materials);
        for(const jm of geometries[0].meshes) {
            const new_group_start = indicies.length;
            
            indicies = indicies.concat(...jm.triangles.map(i => (vertices.length/3)+i));
            vertices = vertices.concat(...jm.positions.flat());
            normals = normals.concat(...jm.normal_sets[0]);
            uv = uv.concat(...jm.uv_sets[0].map(e => [e[0], 1-e[1]]).flat());
            skinIndices = skinIndices.concat(...[0,0,0,0]); // TODO!
            skinWeights = skinWeights.concat(...jm.weights.map(weight => [0,0,0,0].map((_,i) => weight[i] ?? 0)));

            const material_i = material_indicies[jm.meta_material];
            const last_group = geometry.groups.at(-1);
            if(last_group?.materialIndex != material_i) {
                if(last_group) {
                    last_group.count = new_group_start - last_group.start;
                }
                geometry.addGroup(new_group_start, indicies.length - new_group_start, material_i);
            }
        }

        geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
        geometry.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( skinIndices, 4 ) );
        geometry.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
        geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 4 ) );
        geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
        geometry.setIndex(indicies);
        geometry.computeVertexNormals();

        const skeleton = new THREE.Skeleton( [new THREE.Bone()] );
        skinnedMesh.bind(skeleton);
        return skinnedMesh;
    }
}


class LegendsEntity extends THREE.Object3D {
    constructor(json, model) {
        super();
        this.json = json;
        this.add(model);
    }
}


export class LegendsEntityLoader extends THREE.Loader {
    constructor(manager) {
        super(manager);
    }

    load( url, onLoad, onProgress, onError ) {
		const scope = this;
		const loader = new THREE.FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( url, async function ( text ) {
			try {
				onLoad( await scope.parse( text ) );
			} catch ( e ) {
				if ( onError ) {
					onError( e );
				} else {
					console.error( e );
				}
				scope.manager.itemError( url );
			}
		}, onProgress, onError );
	}

    async parse( text ) {
        const json = JSON.parse( text );
        const entity = json["minecraft:client_entity"];
        const geometry_name = entity.description.geometry.default.split(".").at(-1);
 
        const modelLoader = new LegendsModelLoader( this.manager );
        const materialLoader = new LegendsMaterialLoader( this.manager );
        if(entity.description.face_poses) {
            materialLoader.setFacePoses(entity.description.face_poses);
        }
        modelLoader.setMaterialLoader(materialLoader);

        const model = await modelLoader.loadAsync(`models/entity/${geometry_name}.model.json`);
        const legendsEntity = new LegendsEntity(entity, model);
        return legendsEntity
    }
}
