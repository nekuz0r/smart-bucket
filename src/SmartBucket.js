import AWS from 'aws-sdk';
import _ from 'lodash';

export default class SmartBucket {
  static file = null;
  static checkInterval = null;
  static s3Client = null;

  static init (config) {
    this.checkInterval = config.checkInterval || 60 * 1000;
    this.files = _.cloneDeep(config.files);
    this.s3Client = new AWS.S3();
  }

  static getArray (filenames) {
    const keys = [].concat(filenames);
    const files = _.pick(this.files, keys);
    const diff = _.difference(keys, _.keys(files));
    if (diff.length) {
      return Promise.reject(new Error('No such file(s): ' + diff.join(', ')));
    }

    return Promise.all(_.map(files, (file, key) => {
      return this.checkCache(file)
      .then((isValid) => {
        if (isValid) {
          return Promise.all([ null, this.getFromCache(file) ]);
        }
        return this.getAndRefreshCache(file)
        .then((data) => {
          return [ null, data ];
        })
        .catch((error) => {
          return Promise.all([ error, this.getFromCache(file) ]);
        });
      })
      .then(([error, result]) => {
        let ret = {
          [key]: result
        };

        if (error) {
          ret.error = _.merge(error, {
            file: key,
            bucket: file.bucket,
            key: file.key
          });
        }

        return ret;
      });
    }))
    .then((results) => {
      return _.mergeWith({}, ...results, (objValue, srcValue, key, object, source, stack) => {
        if (key === 'error') {
          return [].concat(object.error || [], srcValue);
        }
      });
    });
  }

  static get (filename) {
    return this.getArray(filename)
    .then((result) => {
      if (result.error && result.error[0]) {
        return Promise.reject(result.error[0]);
      }
      return result[filename];
    });
  }

  static getAll () {
    return this.get(this.files.keys());
  }

  static checkCache (file) {
    return Promise.resolve(file.cache)
    .then((cache) => {
      if (cache) {
        const now = Date.now();
        if (now - cache.lastCheck < this.checkInterval) {
          return true;
        }
        file.cache.lastCheck = now;
        return new Promise((resolve, reject) => {
          this.s3Client.headObject({
            Bucket: file.bucket,
            Key: file.key
          }, (error, object) => {
            if (error) {
              return reject(error);
            }
            return resolve(object);
          });
        })
        .then((object) => {
          if (file.cache.lastModified === new Date(object.LastModified)) {
            return true;
          }
          return false;
        });
      }
      return false;
    });
  }

  static getFromCache (file) {
    return Promise.resolve((file.cache && file.cache.body) || null);
  }

  static getAndRefreshCache (file) {
    return new Promise((resolve, reject) => {
      this.s3Client.getObject({
        Bucket: file.bucket,
        Key: file.key
      }, (error, object) => {
        if (error) {
          return reject(error);
        }
        return resolve(object);
      });
    })
    .then((object) => {
      let result = null;
      switch (file.format) {
        case 'string':
          result = object.Body.toString();
          break;
        case 'json':
          result = JSON.parse(object.Body.toString());
          break;
        case 'binary':
        default:
          result = object.Body;
      }

      file.cache = {
        lastCheck: Date.now(),
        lastModified: new Date(object.LastModified),
        body: result
      };

      return result;
    });
  }
}
