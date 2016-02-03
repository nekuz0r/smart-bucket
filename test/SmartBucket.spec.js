import AWSMock from 'mock-aws';
import SmartBucket from '../src/SmartBucket';
import testConfig from './config.test.json';

describe('SmartBucket', () => {
  AWSMock.mock('S3', 'getObject', []);
  AWSMock.mock('S3', 'headObject', []);

  SmartBucket.init(testConfig);

  it('exposes a get method', () => {
    return expect(SmartBucket).itself.to.respondTo('get');
  });

  it('exposes a getArray method', () => {
    return expect(SmartBucket).itself.to.respondTo('getArray');
  });

  it('exposes a getAll method', () => {
    return expect(SmartBucket).itself.to.respondTo('getAll');
  });
});
