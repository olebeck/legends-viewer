import * as THREE from 'three'; 

const legendsShaders = {
    "base_entity_hero_face": (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `
            #include <uv_vertex>
            #ifdef USE_UV
            vUv /= vec2(9,3);
            #endif
        `
      )
    }
}

class LegendsMaterialLoader extends THREE.Loader {
    constructor( manager ) {
        super( manager );
    }

    load(filename, onLoad, onProgress, onError) {
        const scope = this;

		const loader = new THREE.FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
        loader.setResponseType("json");
		loader.load( `${filename}.json`, function ( json ) {
            const s = filename.split("/");
            const name = s[s.length-1];
            const key = Object.keys(json).find(e => e.split(":")[0] == name);
            const jm = json[key];
            const materialBase = key.split(":")[1];

            const material = new THREE.MeshBasicMaterial({
                color: 0xaaeeff,
                side: THREE.DoubleSide,
                transparent: true,
                depthFunc: THREE.LessDepth,
                depthWrite: true,
            });

            const shaderFunc = legendsShaders[materialBase];
            if(shaderFunc) {
                material.onBeforeCompile = shaderFunc;
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
                    }, null, (err) => {
                        loader.load( jm.textures[jt]+".hdr", (texture) => {
                            texture.magFilter = THREE.NearestFilter;
                            texture.minFilter = THREE.NearestFilter;
                            material[type] = texture;
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
    }

    load( name, onLoad, onProgress, onError ) {
		const scope = this;
		const loader = new THREE.FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( `${name}.model.json`, function ( text ) {
			try {
				onLoad( scope.parse( text ) );
			} catch ( e ) {
				if ( onError ) {
					onError( e );
				} else {
					console.error( e );
				}
				scope.manager.itemError( name );
			}
		}, onProgress, onError );
	}

    parse( data ) {
        const materialLoader = new LegendsMaterialLoader( this.manager );
        materialLoader.setPath( this.path );

        const ret = {
            meshes: [],
        };

        const json = JSON.parse( data );
        const geometries = json["minecraft:geometry"];
        window.geometry = geometries;

        const group = new THREE.Group();
        window.model = group;
        
        const materials = new Map();

        for(const jm of geometries[0].meshes) {
            const geometry = new THREE.BufferGeometry();

            const vertices = jm.positions.flat();
            const normals = jm.normal_sets[0].flat();
            const uv = new Float32Array(jm.uv_sets[0].map(e => [e[0], 1-e[1]]).flat());

            geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
            geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
            geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( uv, 2 ) );
            geometry.setIndex(jm.triangles);

            const mesh = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }) );

            if(materials.has(jm.meta_material)) {
                mesh.material = materials.get(jm.meta_material);
            } else {
                materialLoader.load(`materials/meta_materials/${jm.meta_material}`, function (material) {
                    materials.set(jm.meta_material, material);
                    mesh.material = material;
                });
            }

            group.add(mesh);
        }
        
        ret.meshes.push(group);

        return ret;
    }
}
